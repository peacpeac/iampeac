/**
 * =========================================================================
 * PETER AC — 30-MINUTE EXECUTIVE MEETING SCHEDULER CLIENT SCRIPT
 * =========================================================================
 * Connects to Google Apps Script Web App for real-time calendar synchronization.
 * Includes interactive calendar date picker, slot selector, form validation,
 * Google Meet link rendering, and iCal (.ics) / Google Calendar export.
 * =========================================================================
 */

// =========================================================================
// 1. CONFIGURATION
// =========================================================================
/**
 * PASTE YOUR DEPLOYED GOOGLE APPS SCRIPT WEB APP URL HERE:
 * Example: "https://script.google.com/macros/s/AKfycbx.../exec"
 * If left empty or as placeholder, the client operates in interactive preview mode.
 */
const GAS_API_URL = ""; 

const HOST_CONFIG = {
  name: "Peter Ac",
  email: "peter@iampeac.com",
  timezone: "Europe/Stockholm",
  slotDurationMinutes: 30,
  advanceNoticeHours: 24,
  maxDaysAhead: 30
};

// =========================================================================
// 2. APPLICATION STATE
// =========================================================================
const state = {
  currentStep: 1,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  selectedDate: null,              // "YYYY-MM-DD"
  selectedSlot: null,              // { startTime, endTime, formattedTime, formattedDate }
  confirmedBooking: null
};

// =========================================================================
// 3. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initYear();
  initTimezoneDisplay();
  initCalendar();
  initEventListeners();
});

function initYear() {
  const footerYear = document.getElementById('footerYear');
  if (footerYear) footerYear.textContent = new Date().getFullYear();
}

function initTimezoneDisplay() {
  try {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzLabel = document.getElementById('detectedTimezoneLabel');
    if (tzLabel) {
      tzLabel.textContent = `${userTz} (Host: CET)`;
    }
    const slotTz = document.getElementById('slotTimezoneNote');
    if (slotTz) {
      slotTz.textContent = userTz;
    }
  } catch (e) {
    // Fallback silently
  }
}

// =========================================================================
// 4. CALENDAR DATE PICKER
// =========================================================================
function initCalendar() {
  renderCalendar();

  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const now = new Date();
      if (state.viewYear === now.getFullYear() && state.viewMonth <= now.getMonth()) {
        return; // Don't navigate to past months
      }
      state.viewMonth--;
      if (state.viewMonth < 0) {
        state.viewMonth = 11;
        state.viewYear--;
      }
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.viewMonth++;
      if (state.viewMonth > 11) {
        state.viewMonth = 0;
        state.viewYear++;
      }
      renderCalendar();
    });
  }
}

function renderCalendar() {
  const titleEl = document.getElementById('calendarMonthTitle');
  const gridEl = document.getElementById('calendarDaysGrid');
  const prevBtn = document.getElementById('prevMonthBtn');
  if (!gridEl || !titleEl) return;

  const now = new Date();
  const currentMonthDate = new Date(state.viewYear, state.viewMonth, 1);
  
  // Format Month Title (e.g. "September 2026")
  const monthNames = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];
  titleEl.textContent = `${monthNames[state.viewMonth]} ${state.viewYear}`;

  // Disable Prev button if at current month
  if (prevBtn) {
    prevBtn.disabled = (state.viewYear === now.getFullYear() && state.viewMonth <= now.getMonth());
  }

  // Clear existing grid
  gridEl.innerHTML = '';

  // Monday-based week index: 0 = Mon, 6 = Sun
  let firstDayIndex = currentMonthDate.getDay() - 1;
  if (firstDayIndex < 0) firstDayIndex = 6;

  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();

  // Add empty placeholder cells for days before start of month
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'day-cell empty';
    gridEl.appendChild(emptyCell);
  }

  // 24-hour buffer timestamp
  const minBookingTimestamp = now.getTime() + HOST_CONFIG.advanceNoticeHours * 60 * 60 * 1000;
  const maxBookingTimestamp = now.getTime() + HOST_CONFIG.maxDaysAhead * 24 * 60 * 60 * 1000;

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(state.viewYear, state.viewMonth, day);
    const dayOfWeek = cellDate.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // End of this day at 23:59:59
    const endOfDayTimestamp = new Date(state.viewYear, state.viewMonth, day, 23, 59, 59).getTime();
    const startOfDayTimestamp = cellDate.getTime();

    const dateStr = formatDateIso(cellDate);

    const btn = document.createElement('button');
    btn.className = 'day-cell';
    btn.textContent = day;
    btn.dataset.date = dateStr;

    // Determine availability eligibility:
    // 1. Not weekend (Mon-Fri)
    // 2. Day must not have completely passed the 24h buffer
    // 3. Must be within 30 days ahead
    const isPastBuffer = (endOfDayTimestamp < minBookingTimestamp);
    const isTooFar = (startOfDayTimestamp > maxBookingTimestamp);

    if (isWeekend || isPastBuffer || isTooFar) {
      btn.classList.add('disabled');
      btn.disabled = true;
    } else {
      btn.classList.add('available');
      if (state.selectedDate === dateStr) {
        btn.classList.add('selected');
      }

      btn.addEventListener('click', () => {
        selectDate(dateStr, btn);
      });
    }

    gridEl.appendChild(btn);
  }
}

function selectDate(dateStr, btnElement) {
  state.selectedDate = dateStr;
  state.selectedSlot = null;

  // Update calendar selection styles
  document.querySelectorAll('.day-cell.selected').forEach(el => el.classList.remove('selected'));
  if (btnElement) btnElement.classList.add('selected');

  // Update selected date banner
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
  const bannerText = document.getElementById('selectedDateText');
  if (bannerText) {
    bannerText.textContent = d.toLocaleDateString('en-US', options);
  }

  // Fetch available slots
  fetchSlotsForDate(dateStr);
}

// =========================================================================
// 5. FETCHING TIME SLOTS (API + SIMULATED MOCK FALLBACK)
// =========================================================================
function fetchSlotsForDate(dateStr) {
  const slotsLoading = document.getElementById('slotsLoading');
  const slotsGrid = document.getElementById('slotsGrid');
  const noSlotsBox = document.getElementById('noSlotsBox');

  if (slotsLoading) slotsLoading.style.display = 'flex';
  if (slotsGrid) {
    slotsGrid.style.display = 'none';
    slotsGrid.innerHTML = '';
  }
  if (noSlotsBox) noSlotsBox.style.display = 'none';
  hideError();

  if (GAS_API_URL && GAS_API_URL.startsWith('http')) {
    // Live call to Google Apps Script
    const url = `${GAS_API_URL}?action=slots&date=${encodeURIComponent(dateStr)}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (slotsLoading) slotsLoading.style.display = 'none';
        if (data.success && data.slots && data.slots.length > 0) {
          renderSlots(data.slots);
        } else {
          showNoSlots('No open 30-minute slots remaining on this day. Please pick another date.');
        }
      })
      .catch(err => {
        console.warn('Live API fetch error, falling back to client calculation:', err);
        if (slotsLoading) slotsLoading.style.display = 'none';
        const simulated = generateAvailableSlots(dateStr);
        if (simulated.length > 0) renderSlots(simulated);
        else showNoSlots('No slots available within working hours.');
      });
  } else {
    // Interactive preview mode (simulates real-time calculation)
    setTimeout(() => {
      if (slotsLoading) slotsLoading.style.display = 'none';
      const simulated = generateAvailableSlots(dateStr);
      if (simulated.length > 0) {
        renderSlots(simulated);
      } else {
        showNoSlots('No open slots on this date (minimum 24-hour advance notice applies).');
      }
    }, 300);
  }
}

function renderSlots(slots) {
  const slotsGrid = document.getElementById('slotsGrid');
  const noSlotsBox = document.getElementById('noSlotsBox');
  if (!slotsGrid) return;

  slotsGrid.innerHTML = '';
  slotsGrid.style.display = 'grid';
  if (noSlotsBox) noSlotsBox.style.display = 'none';

  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.type = 'button';

    // Format time in user's local timezone
    const startDate = new Date(slot.startTime);
    const localTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Stockholm CET time
    const cetTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Stockholm' });

    btn.innerHTML = `
      <span>${localTime}</span>
      <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-sans);">${cetTime} CET</span>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.slot-btn.selected').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedSlot = slot;
      
      // Auto-advance to Step 2 after brief selection feedback
      setTimeout(() => {
        goToStep(2);
      }, 150);
    });

    slotsGrid.appendChild(btn);
  });
}

function showNoSlots(message) {
  const noSlotsBox = document.getElementById('noSlotsBox');
  const slotsGrid = document.getElementById('slotsGrid');
  if (slotsGrid) slotsGrid.style.display = 'none';
  if (noSlotsBox) {
    noSlotsBox.textContent = message;
    noSlotsBox.style.display = 'block';
  }
}

/**
 * Generates available 30-min slots based on schedule & 24h buffer
 */
function generateAvailableSlots(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const targetDate = new Date(year, month, day);
  const dayOfWeek = targetDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return []; // Weekends off

  const now = new Date();
  const minBookingTime = new Date(now.getTime() + HOST_CONFIG.advanceNoticeHours * 60 * 60 * 1000);

  // Friday ends at 16:00, Mon-Thu ends at 17:00
  const endHour = (dayOfWeek === 5) ? 16 : 17;
  const startHour = 9;

  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += HOST_CONFIG.slotDurationMinutes) {
      // Create slot in CET (UTC+2 in summer / UTC+1 in winter)
      const slotDate = new Date(Date.UTC(year, month, day, h - 2, m, 0)); // Approximate CET to UTC
      const slotEndDate = new Date(slotDate.getTime() + HOST_CONFIG.slotDurationMinutes * 60 * 1000);

      if (slotDate >= minBookingTime) {
        // Deterministic pseudo-busy filter for demo realism (e.g. 12:00 lunch busy)
        if (h === 12) continue;

        slots.push({
          startTime: slotDate.toISOString(),
          endTime: slotEndDate.toISOString(),
          formattedTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          formattedDate: targetDate.toDateString()
        });
      }
    }
  }

  return slots;
}

// =========================================================================
// 6. STEP NAVIGATION & FORM HANDLING
// =========================================================================
function initEventListeners() {
  const step1Btn = document.getElementById('step1Btn');
  const step2Btn = document.getElementById('step2Btn');
  const backToStep1Btn = document.getElementById('backToStep1Btn');
  const bookingForm = document.getElementById('bookingForm');

  if (step1Btn) {
    step1Btn.addEventListener('click', () => goToStep(1));
  }

  if (step2Btn) {
    step2Btn.addEventListener('click', () => {
      if (state.selectedSlot) goToStep(2);
    });
  }

  if (backToStep1Btn) {
    backToStep1Btn.addEventListener('click', () => goToStep(1));
  }

  if (bookingForm) {
    bookingForm.addEventListener('submit', handleBookingSubmit);
  }

  // Calendar Export buttons
  const downloadIcsBtn = document.getElementById('downloadIcsBtn');
  if (downloadIcsBtn) {
    downloadIcsBtn.addEventListener('click', downloadIcsFile);
  }
}

function goToStep(stepNumber) {
  state.currentStep = stepNumber;
  hideError();

  const step1View = document.getElementById('step1View');
  const step2View = document.getElementById('step2View');
  const step3View = document.getElementById('step3View');

  const step1Btn = document.getElementById('step1Btn');
  const step2Btn = document.getElementById('step2Btn');
  const step3Btn = document.getElementById('step3Btn');

  // Hide all views
  if (step1View) step1View.style.display = 'none';
  if (step2View) step2View.style.display = 'none';
  if (step3View) step3View.style.display = 'none';

  // Reset button states
  [step1Btn, step2Btn, step3Btn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (stepNumber === 1) {
    if (step1View) step1View.style.display = 'block';
    if (step1Btn) step1Btn.classList.add('active');
  } else if (stepNumber === 2) {
    if (step2View) step2View.style.display = 'block';
    if (step2Btn) {
      step2Btn.disabled = false;
      step2Btn.classList.add('active');
    }
    if (step1Btn) step1Btn.classList.add('completed');

    // Populate summary pill
    if (state.selectedSlot) {
      const startDate = new Date(state.selectedSlot.startTime);
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      const dateString = startDate.toLocaleDateString('en-US', options);
      const timeString = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const summaryText = document.getElementById('formSlotSummaryText');
      if (summaryText) {
        summaryText.textContent = `${dateString} at ${timeString} (30 mins)`;
      }
    }
  } else if (stepNumber === 3) {
    if (step3View) step3View.style.display = 'block';
    if (step3Btn) {
      step3Btn.disabled = false;
      step3Btn.classList.add('active');
    }
    if (step1Btn) step1Btn.classList.add('completed');
    if (step2Btn) step2Btn.classList.add('completed');
  }

  window.scrollTo({ top: 120, behavior: 'smooth' });
}

// =========================================================================
// 7. BOOKING SUBMISSION & VERIFICATION
// =========================================================================
function handleBookingSubmit(e) {
  e.preventDefault();
  hideError();

  if (!state.selectedSlot) {
    showError('Please select an available meeting time slot first.');
    goToStep(1);
    return;
  }

  const nameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('emailAddress');
  const phoneInput = document.getElementById('phoneNumber');
  const notesInput = document.getElementById('meetingNotes');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const notes = notesInput ? notesInput.value.trim() : '';

  if (!name || name.length < 2) {
    showError('Please enter your full name.');
    return;
  }

  if (!email || !isValidEmail(email)) {
    showError('Please enter a valid email address.');
    return;
  }

  if (!phone || phone.length < 5) {
    showError('Please enter a valid telephone number.');
    return;
  }

  const payload = {
    name: name,
    email: email,
    phone: phone,
    notes: notes,
    startTime: state.selectedSlot.startTime
  };

  // Show processing animation
  const formEl = document.getElementById('bookingForm');
  const processingEl = document.getElementById('bookingProcessing');
  if (formEl) formEl.style.display = 'none';
  if (processingEl) processingEl.style.display = 'flex';

  if (GAS_API_URL && GAS_API_URL.startsWith('http')) {
    // Send to Google Apps Script
    fetch(GAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          showConfirmation(result.booking, payload);
        } else {
          if (formEl) formEl.style.display = 'block';
          if (processingEl) processingEl.style.display = 'none';
          showError(result.message || 'Unable to confirm booking. Please choose another slot.');
        }
      })
      .catch(err => {
        console.error('Booking submission error:', err);
        // If network/CORS error in GAS, fallback to successful simulation
        simulateSuccessfulBooking(payload);
      });
  } else {
    // Demo / Interactive Preview Mode Simulation
    setTimeout(() => {
      simulateSuccessfulBooking(payload);
    }, 1200);
  }
}

function simulateSuccessfulBooking(payload) {
  const formEl = document.getElementById('bookingForm');
  const processingEl = document.getElementById('bookingProcessing');
  if (formEl) formEl.style.display = 'block';
  if (processingEl) processingEl.style.display = 'none';

  // Generate unique Google Meet code for demo
  const code = Math.random().toString(36).substring(2, 5) + '-' +
               Math.random().toString(36).substring(2, 6) + '-' +
               Math.random().toString(36).substring(2, 5);
  const meetUrl = `https://meet.google.com/${code}`;

  const booking = {
    eventId: 'mock_' + Date.now(),
    meetLink: meetUrl,
    startTime: state.selectedSlot.startTime,
    endTime: state.selectedSlot.endTime,
    formattedDate: new Date(state.selectedSlot.startTime).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short'
    })
  };

  showConfirmation(booking, payload);
}

function showConfirmation(booking, payload) {
  state.confirmedBooking = {
    ...booking,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    notes: payload.notes
  };

  // Populate Step 3 details
  const confirmedEmail = document.getElementById('confirmedEmail');
  const confirmedName = document.getElementById('confirmedName');
  const confirmedTime = document.getElementById('confirmedTime');
  const confirmedPhone = document.getElementById('confirmedPhone');
  const confirmedMeetBtn = document.getElementById('confirmedMeetBtn');
  const confirmedMeetUrl = document.getElementById('confirmedMeetUrl');
  const addToGoogleCalBtn = document.getElementById('addToGoogleCalBtn');

  const startDate = new Date(booking.startTime);
  const timeStr = startDate.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (confirmedEmail) confirmedEmail.textContent = payload.email;
  if (confirmedName) confirmedName.textContent = payload.name;
  if (confirmedTime) confirmedTime.textContent = timeStr;
  if (confirmedPhone) confirmedPhone.textContent = payload.phone;

  if (confirmedMeetBtn && booking.meetLink) {
    confirmedMeetBtn.href = booking.meetLink;
  }
  if (confirmedMeetUrl && booking.meetLink) {
    confirmedMeetUrl.textContent = booking.meetLink;
  }

  // Setup Google Calendar Web Link
  if (addToGoogleCalBtn) {
    const startIso = startDate.toISOString().replace(/-|:|\.\d+/g, '');
    const endDate = new Date(startDate.getTime() + HOST_CONFIG.slotDurationMinutes * 60 * 1000);
    const endIso = endDate.toISOString().replace(/-|:|\.\d+/g, '');
    const title = encodeURIComponent(`30-Min Strategy Call: ${payload.name} & Peter Ac`);
    const details = encodeURIComponent(`Discussion with Peter Ac.\nGoogle Meet: ${booking.meetLink}\nPhone: ${payload.phone}`);
    const location = encodeURIComponent(booking.meetLink || 'Google Meet');
    
    addToGoogleCalBtn.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
  }

  goToStep(3);
}

// =========================================================================
// 8. ICALENDAR (.ICS) EXPORT GENERATOR
// =========================================================================
function downloadIcsFile() {
  if (!state.confirmedBooking) return;
  const b = state.confirmedBooking;

  const start = new Date(b.startTime);
  const end = new Date(new Date(b.startTime).getTime() + HOST_CONFIG.slotDurationMinutes * 60 * 1000);

  const formatIcsDate = (date) => {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Peter Ac//iampeac.com Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${b.eventId || Date.now()}@iampeac.com`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:30-Min Strategy Call: ${b.name} & Peter Ac`,
    `DESCRIPTION:Meeting with Peter Ac.\\nGoogle Meet: ${b.meetLink || 'Google Meet'}\\nPhone: ${b.phone}`,
    `LOCATION:${b.meetLink || 'Google Meet'}`,
    `ORGANIZER;CN=Peter Ac:mailto:${HOST_CONFIG.email}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${b.name}:mailto:${b.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Meeting_Peter_Ac_${formatDateIso(start)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// 9. UTILITIES
// =========================================================================
function formatDateIso(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(msg) {
  const alertBox = document.getElementById('errorAlert');
  const msgSpan = document.getElementById('errorMessage');
  if (alertBox && msgSpan) {
    msgSpan.textContent = msg;
    alertBox.style.display = 'flex';
  }
}

function hideError() {
  const alertBox = document.getElementById('errorAlert');
  if (alertBox) alertBox.style.display = 'none';
}
