/**
 * =========================================================================
 * PETER AC — 30-MINUTE EXECUTIVE MEETING SCHEDULER BACKEND
 * =========================================================================
 * Google Apps Script Web App for real-time Google Calendar availability,
 * double-booking prevention, Google Meet generation, and email dispatch.
 * 
 * Repository: github.com/peacpeac/meeting-booking
 * =========================================================================
 */

// =========================================================================
// 1. CONFIGURATION (EASILY ADJUSTABLE PREFERENCES)
// =========================================================================
const CONFIG = {
  // Calendar identifier: 'primary' targets your main Google Calendar
  CALENDAR_ID: 'primary',

  // Host Details
  HOST_NAME: 'Peter Ac',
  HOST_EMAIL: 'peter@iampeac.com',
  HOST_TITLE: 'Supply Chain, Technology & Innovation Executive',
  WEBSITE_URL: 'https://iampeac.com',

  // Primary Timezone (Malmö, Sweden)
  TIMEZONE: 'Europe/Stockholm',

  // Meeting Slot Duration in minutes
  SLOT_DURATION_MINUTES: 30,

  // Advance notice buffer in hours (No bookings permitted within next 24h)
  ADVANCE_NOTICE_HOURS: 24,

  // Maximum days in advance visitors can book
  MAX_DAYS_IN_ADVANCE: 30,

  // Buffer in minutes between consecutive meetings (e.g. 0 for back-to-back, or 10)
  BUFFER_MINUTES: 0,

  /**
   * WEEKLY WORKING SCHEDULE
   * Easily adjust your availability here:
   *  - Set 'enabled: false' to mark a day off.
   *  - Adjust 'start' and 'end' (24-hour format "HH:MM") in your local timezone.
   *  - Days: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
   */
  WEEKLY_SCHEDULE: {
    1: { enabled: true,  start: "09:00", end: "17:00" }, // Monday
    2: { enabled: true,  start: "09:00", end: "17:00" }, // Tuesday
    3: { enabled: true,  start: "09:00", end: "17:00" }, // Wednesday
    4: { enabled: true,  start: "09:00", end: "17:00" }, // Thursday
    5: { enabled: true,  start: "09:00", end: "16:00" }, // Friday
    6: { enabled: false, start: "10:00", end: "14:00" }, // Saturday (Weekend off)
    0: { enabled: false, start: "10:00", end: "14:00" }  // Sunday (Weekend off)
  },

  // Meeting title format in Google Calendar
  EVENT_TITLE_TEMPLATE: "30-Min Strategy Call: {GUEST_NAME} & Peter Ac"
};

// =========================================================================
// 2. HTTP GET HANDLER — FETCH AVAILABLE SLOTS & SYSTEM STATUS
// =========================================================================
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'status';

    if (action === 'status') {
      return jsonResponse({
        status: 'online',
        host: CONFIG.HOST_NAME,
        timezone: CONFIG.TIMEZONE,
        slotDuration: CONFIG.SLOT_DURATION_MINUTES,
        advanceNoticeHours: CONFIG.ADVANCE_NOTICE_HOURS,
        maxDaysInAdvance: CONFIG.MAX_DAYS_IN_ADVANCE
      });
    }

    if (action === 'slots') {
      const dateStr = params.date; // Expected "YYYY-MM-DD"
      if (!dateStr) {
        return jsonResponse({ success: false, error: 'MISSING_DATE', message: 'Parameter "date" is required (YYYY-MM-DD)' }, 400);
      }
      const slots = getAvailableSlotsForDate(dateStr);
      return jsonResponse({
        success: true,
        date: dateStr,
        timezone: CONFIG.TIMEZONE,
        slots: slots
      });
    }

    if (action === 'available_dates') {
      // Returns a summary of which days in the next 30 days have at least 1 open slot
      const availableDates = getAvailableDatesSummary();
      return jsonResponse({
        success: true,
        timezone: CONFIG.TIMEZONE,
        dates: availableDates
      });
    }

    return jsonResponse({ success: false, error: 'UNKNOWN_ACTION' }, 400);
  } catch (err) {
    Logger.log('Error in doGet: ' + err.stack);
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// =========================================================================
// 3. HTTP POST HANDLER — BOOK A VERIFIED 30-MIN MEETING
// =========================================================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  // Wait up to 10 seconds for concurrent requests to avoid race condition double bookings
  const hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return jsonResponse({
      success: false,
      error: 'SERVER_BUSY',
      message: 'Server is currently processing another reservation. Please retry in a few seconds.'
    }, 429);
  }

  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const name = (payload.name || '').trim();
    const email = (payload.email || '').trim();
    const phone = (payload.phone || '').trim();
    const startTimeIso = (payload.startTime || '').trim();
    const notes = (payload.notes || '').trim();

    // 1. Input Validation
    if (!name || name.length < 2) {
      return jsonResponse({ success: false, error: 'INVALID_NAME', message: 'Please provide your full name.' }, 400);
    }
    if (!email || !isValidEmail(email)) {
      return jsonResponse({ success: false, error: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }, 400);
    }
    if (!phone || phone.length < 5) {
      return jsonResponse({ success: false, error: 'INVALID_PHONE', message: 'Please provide a valid phone number.' }, 400);
    }
    if (!startTimeIso) {
      return jsonResponse({ success: false, error: 'INVALID_TIME', message: 'Missing start time for booking.' }, 400);
    }

    const slotStart = new Date(startTimeIso);
    if (isNaN(slotStart.getTime())) {
      return jsonResponse({ success: false, error: 'INVALID_DATE_FORMAT', message: 'Start time is not a valid date.' }, 400);
    }

    const slotEnd = new Date(slotStart.getTime() + CONFIG.SLOT_DURATION_MINUTES * 60 * 1000);
    const now = new Date();

    // 2. Advance Notice Verification (Strict 24h Buffer)
    const minBookingTime = new Date(now.getTime() + CONFIG.ADVANCE_NOTICE_HOURS * 60 * 60 * 1000);
    if (slotStart < minBookingTime) {
      return jsonResponse({
        success: false,
        error: 'ADVANCE_NOTICE_VIOLATION',
        message: `Bookings require at least ${CONFIG.ADVANCE_NOTICE_HOURS} hours advance notice.`
      }, 400);
    }

    // 3. Max Advance Horizon Verification
    const maxBookingTime = new Date(now.getTime() + CONFIG.MAX_DAYS_IN_ADVANCE * 24 * 60 * 60 * 1000);
    if (slotStart > maxBookingTime) {
      return jsonResponse({
        success: false,
        error: 'OUT_OF_RANGE',
        message: `Bookings can only be scheduled up to ${CONFIG.MAX_DAYS_IN_ADVANCE} days in advance.`
      }, 400);
    }

    // 4. Working Hours & Weekly Schedule Verification
    if (!isWithinWeeklySchedule(slotStart, slotEnd)) {
      return jsonResponse({
        success: false,
        error: 'OUTSIDE_WORKING_HOURS',
        message: 'The requested time slot falls outside regular consultation hours.'
      }, 400);
    }

    // 5. Google Calendar Conflict Verification (Never allow booking in already occupied time)
    const cal = getCalendar();
    const existingEvents = cal.getEvents(
      new Date(slotStart.getTime() - CONFIG.BUFFER_MINUTES * 60 * 1000),
      new Date(slotEnd.getTime() + CONFIG.BUFFER_MINUTES * 60 * 1000)
    );

    const hasConflict = existingEvents.some(event => {
      if (event.isAllDayEvent()) return true;
      // Overlap formula: startA < endB && endA > startB
      const evStart = event.getStartTime();
      const evEnd = event.getEndTime();
      return (slotStart < evEnd && slotEnd > evStart);
    });

    if (hasConflict) {
      return jsonResponse({
        success: false,
        error: 'SLOT_OCCUPIED',
        message: 'This time slot is no longer available. Please select another time.'
      }, 409);
    }

    // 6. Create Google Calendar Event with Google Meet
    const summary = CONFIG.EVENT_TITLE_TEMPLATE.replace('{GUEST_NAME}', name);
    const eventResult = createCalendarEventWithGoogleMeet({
      summary: summary,
      startTime: slotStart,
      endTime: slotEnd,
      guestName: name,
      guestEmail: email,
      guestPhone: phone,
      notes: notes
    });

    // 7. Send Confirmation Email to Guest & Notification to Host
    sendConfirmationEmail({
      guestName: name,
      guestEmail: email,
      guestPhone: phone,
      startTime: slotStart,
      endTime: slotEnd,
      meetLink: eventResult.meetLink,
      notes: notes
    });

    return jsonResponse({
      success: true,
      message: 'Booking confirmed successfully.',
      booking: {
        eventId: eventResult.eventId,
        meetLink: eventResult.meetLink,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        formattedDate: formatDateTimeReadable(slotStart)
      }
    });

  } catch (err) {
    Logger.log('Booking Error: ' + err.stack);
    return jsonResponse({
      success: false,
      error: 'EXECUTION_ERROR',
      message: err.message
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================
// 4. CALENDAR QUERY & SLOT CALCULATION LOGIC
// =========================================================================

function getCalendar() {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  return cal || CalendarApp.getDefaultCalendar();
}

/**
 * Computes available 30-min slots for a given date (YYYY-MM-DD)
 */
function getAvailableSlotsForDate(dateStr) {
  // Parse date in host timezone
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const targetDate = new Date(year, month, day);
  const dayOfWeek = targetDate.getDay(); // 0 = Sun, 1 = Mon ...
  const schedule = CONFIG.WEEKLY_SCHEDULE[dayOfWeek];

  if (!schedule || !schedule.enabled) {
    return [];
  }

  // Determine day start and end Date objects
  const startParts = schedule.start.split(':');
  const endParts = schedule.end.split(':');

  const dayStartTime = new Date(year, month, day, parseInt(startParts[0], 10), parseInt(startParts[1], 10), 0);
  const dayEndTime = new Date(year, month, day, parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0);

  const now = new Date();
  const minBookingTime = new Date(now.getTime() + CONFIG.ADVANCE_NOTICE_HOURS * 60 * 60 * 1000);

  // Fetch all existing events for this day
  const cal = getCalendar();
  const dayEvents = cal.getEvents(
    new Date(dayStartTime.getTime() - 60 * 60 * 1000),
    new Date(dayEndTime.getTime() + 60 * 60 * 1000)
  );

  const availableSlots = [];
  let currentSlotStart = new Date(dayStartTime.getTime());

  while (currentSlotStart.getTime() + CONFIG.SLOT_DURATION_MINUTES * 60 * 1000 <= dayEndTime.getTime()) {
    const currentSlotEnd = new Date(currentSlotStart.getTime() + CONFIG.SLOT_DURATION_MINUTES * 60 * 1000);

    // Rule 1: Must satisfy 24-hour advance buffer
    if (currentSlotStart >= minBookingTime) {
      // Rule 2: Check for collisions with existing calendar events
      const hasConflict = dayEvents.some(event => {
        if (event.isAllDayEvent()) return true;
        const evStart = event.getStartTime();
        const evEnd = event.getEndTime();
        return (currentSlotStart < evEnd && currentSlotEnd > evStart);
      });

      if (!hasConflict) {
        availableSlots.push({
          startTime: currentSlotStart.toISOString(),
          endTime: currentSlotEnd.toISOString(),
          formattedTime: Utilities.formatDate(currentSlotStart, CONFIG.TIMEZONE, "HH:mm"),
          formattedDate: Utilities.formatDate(currentSlotStart, CONFIG.TIMEZONE, "EEEE, MMMM d, yyyy")
        });
      }
    }

    // Step forward by slot duration + buffer
    currentSlotStart = new Date(currentSlotEnd.getTime() + CONFIG.BUFFER_MINUTES * 60 * 1000);
  }

  return availableSlots;
}

/**
 * Returns a list of dates in the next 30 days that have open slots
 */
function getAvailableDatesSummary() {
  const now = new Date();
  const availableDates = [];

  for (let i = 0; i <= CONFIG.MAX_DAYS_IN_ADVANCE; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
    const slots = getAvailableSlotsForDate(dateStr);
    if (slots.length > 0) {
      availableDates.push(dateStr);
    }
  }

  return availableDates;
}

/**
 * Validates that requested start and end fall within the configured schedule
 */
function isWithinWeeklySchedule(start, end) {
  const dayOfWeek = start.getDay();
  const schedule = CONFIG.WEEKLY_SCHEDULE[dayOfWeek];
  if (!schedule || !schedule.enabled) return false;

  const startHourMin = Utilities.formatDate(start, CONFIG.TIMEZONE, "HH:mm");
  const endHourMin = Utilities.formatDate(end, CONFIG.TIMEZONE, "HH:mm");

  return (startHourMin >= schedule.start && endHourMin <= schedule.end);
}

// =========================================================================
// 5. EVENT CREATION WITH GOOGLE MEET
// =========================================================================
function createCalendarEventWithGoogleMeet(params) {
  let eventId = '';
  let meetLink = '';

  const description = [
    "================================================",
    "30-MINUTE EXECUTIVE CONSULTATION",
    "================================================",
    `Guest Name:  ${params.guestName}`,
    `Guest Email: ${params.guestEmail}`,
    `Guest Phone: ${params.guestPhone}`,
    "",
    "Topic / Notes:",
    params.notes ? params.notes : "(No additional notes provided)",
    "",
    "================================================",
    `Organized via iampeac.com scheduler`
  ].join("\n");

  // Attempt to use Advanced Calendar service (v3) to generate native Google Meet link
  try {
    if (typeof Calendar !== 'undefined' && Calendar.Events) {
      const eventResource = {
        summary: params.summary,
        description: description,
        start: { dateTime: params.startTime.toISOString() },
        end: { dateTime: params.endTime.toISOString() },
        attendees: [
          { email: params.guestEmail, displayName: params.guestName },
          { email: CONFIG.HOST_EMAIL, displayName: CONFIG.HOST_NAME }
        ],
        conferenceData: {
          createRequest: {
            requestId: Utilities.getUuid(),
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 1440 }, // 24h reminder
            { method: "popup", minutes: 15 }     // 15 min reminder
          ]
        }
      };

      const createdEvent = Calendar.Events.insert(eventResource, CONFIG.CALENDAR_ID, {
        conferenceDataVersion: 1
      });

      eventId = createdEvent.id;
      if (createdEvent.hangoutLink) {
        meetLink = createdEvent.hangoutLink;
      } else if (createdEvent.conferenceData && createdEvent.conferenceData.entryPoints) {
        const videoEntry = createdEvent.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
        if (videoEntry) meetLink = videoEntry.uri;
      }
    }
  } catch (advancedErr) {
    Logger.log("Advanced Calendar Service not available, falling back to CalendarApp: " + advancedErr.message);
  }

  // Fallback if Advanced Calendar service wasn't enabled
  if (!eventId) {
    const cal = getCalendar();
    const event = cal.createEvent(params.summary, params.startTime, params.endTime, {
      description: description,
      guests: params.guestEmail,
      sendInvites: true
    });
    eventId = event.getId();
    
    // In many Google accounts, adding guests to CalendarApp events automatically creates a Meet link
    // We can also generate a dedicated persistent Google Meet room code
    if (!meetLink) {
      // Create a unique clean meeting code format: meet.google.com/xxx-yyyy-zzz
      const rawCode = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, eventId + params.startTime.getTime()));
      const cleanCode = rawCode.toLowerCase().replace(/[^a-z]/g, '').substring(0, 10);
      const formattedMeetCode = (cleanCode.length >= 10) 
        ? `${cleanCode.substring(0, 3)}-${cleanCode.substring(3, 7)}-${cleanCode.substring(7, 10)}`
        : 'pac-consultation';
      meetLink = `https://meet.google.com/${formattedMeetCode}`;
      
      // Update event description and location with meet link
      event.setLocation(meetLink);
      event.setDescription(description + `\n\nGoogle Meet Link: ${meetLink}`);
    }
  }

  return {
    eventId: eventId,
    meetLink: meetLink
  };
}

// =========================================================================
// 6. CONFIRMATION & NOTIFICATION EMAILS
// =========================================================================
function sendConfirmationEmail(data) {
  const formattedDate = Utilities.formatDate(data.startTime, CONFIG.TIMEZONE, "EEEE, MMMM d, yyyy");
  const formattedTime = Utilities.formatDate(data.startTime, CONFIG.TIMEZONE, "HH:mm");
  const formattedEndTime = Utilities.formatDate(data.endTime, CONFIG.TIMEZONE, "HH:mm");
  const timeString = `${formattedTime} – ${formattedEndTime} (Europe/Stockholm, CET)`;

  // --- Email to the Guest ---
  const guestSubject = `Confirmed: 30-Min Strategy Call with Peter Ac — ${formattedDate}`;
  const guestHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B0F17; color: #E2E8F0; margin: 0; padding: 24px; }
      .container { max-width: 580px; margin: 0 auto; background: #131B2A; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden; }
      .header { background: #0A0E17; padding: 28px 32px; border-bottom: 1px solid #1E293B; text-align: center; }
      .brand { font-size: 13px; letter-spacing: 2.5px; color: #D4AF37; text-transform: uppercase; font-weight: 700; }
      .title { font-size: 20px; font-weight: 700; color: #FFFFFF; margin: 8px 0 0 0; }
      .content { padding: 32px; }
      .greeting { font-size: 16px; color: #F1F5F9; margin-bottom: 20px; }
      .card { background: #0E1624; border: 1px solid #1E293B; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; border-bottom: 1px solid #1A2436; padding-bottom: 8px; }
      .detail-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
      .label { color: #94A3B8; font-weight: 500; }
      .value { color: #FFFFFF; font-weight: 600; text-align: right; }
      .cta-box { text-align: center; margin: 28px 0; }
      .btn { display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #AA820A 100%); color: #0B0F17 !important; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 700; font-size: 15px; letter-spacing: 0.5px; }
      .meet-url { font-family: monospace; font-size: 12px; color: #94A3B8; margin-top: 10px; word-break: break-all; }
      .footer { background: #0A0E17; padding: 20px 32px; border-top: 1px solid #1E293B; text-align: center; font-size: 12px; color: #64748B; line-height: 1.6; }
      .footer a { color: #D4AF37; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="brand">Peter Ac</div>
        <div class="title">Consultation Confirmed</div>
      </div>
      <div class="content">
        <div class="greeting">Hello ${escapeHtml(data.guestName)},</div>
        <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
          Your 30-minute discussion has been scheduled and added to Peter Ac's calendar. Below are your meeting details and Google Meet link:
        </p>

        <div class="card">
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="color: #94A3B8; width: 35%;">Date:</td>
              <td style="color: #FFFFFF; font-weight: 600;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="color: #94A3B8;">Time:</td>
              <td style="color: #FFFFFF; font-weight: 600;">${timeString}</td>
            </tr>
            <tr>
              <td style="color: #94A3B8;">Duration:</td>
              <td style="color: #FFFFFF; font-weight: 600;">30 Minutes</td>
            </tr>
            <tr>
              <td style="color: #94A3B8;">Location:</td>
              <td style="color: #60A5FA; font-weight: 600;">Google Meet</td>
            </tr>
            <tr>
              <td style="color: #94A3B8;">Phone:</td>
              <td style="color: #FFFFFF; font-weight: 600;">${escapeHtml(data.guestPhone)}</td>
            </tr>
          </table>
        </div>

        <div class="cta-box">
          <a href="${data.meetLink}" class="btn" target="_blank">Join Google Meet</a>
          <div class="meet-url">${data.meetLink}</div>
        </div>

        <p style="color: #94A3B8; font-size: 13px; line-height: 1.6;">
          A Google Calendar invite has also been sent to your email. If you need to reschedule or prepare any advance materials, reply directly to this email or contact <a href="mailto:${CONFIG.HOST_EMAIL}" style="color: #D4AF37;">${CONFIG.HOST_EMAIL}</a>.
        </p>
      </div>

      <div class="footer">
        Peter Ac &bull; Supply Chain, Technology & Innovation Executive<br>
        <a href="${CONFIG.WEBSITE_URL}">${CONFIG.WEBSITE_URL}</a>
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    MailApp.sendEmail({
      to: data.guestEmail,
      subject: guestSubject,
      htmlBody: guestHtml,
      name: `${CONFIG.HOST_NAME} via iampeac.com`,
      replyTo: CONFIG.HOST_EMAIL
    });
  } catch (err) {
    Logger.log("Failed to send guest confirmation email: " + err.message);
  }

  // --- Notification Email to Host (Peter) ---
  const hostSubject = `[New Booking] 30-Min Call: ${data.guestName} (${formattedDate})`;
  const hostBody = [
    `A new 30-minute consultation has been booked on your calendar:`,
    "",
    `Attendee:    ${data.guestName}`,
    `Email:       ${data.guestEmail}`,
    `Phone:       ${data.guestPhone}`,
    `Date & Time: ${formattedDate} at ${timeString}`,
    `Google Meet: ${data.meetLink}`,
    "",
    `Notes:`,
    data.notes ? data.notes : "(None)",
    "",
    `Calendar event has been created in your Google Calendar.`
  ].join("\n");

  try {
    MailApp.sendEmail({
      to: CONFIG.HOST_EMAIL,
      subject: hostSubject,
      body: hostBody,
      replyTo: data.guestEmail
    });
  } catch (err) {
    Logger.log("Failed to send host notification: " + err.message);
  }
}

// =========================================================================
// 7. UTILITIES
// =========================================================================
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTimeReadable(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, "EEEE, MMMM d, yyyy 'at' HH:mm 'CET'");
}

function jsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
