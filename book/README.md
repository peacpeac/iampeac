# Peter Ac — 30-Minute Executive Meeting Scheduler

An automated, executive consultation booking web application that synchronizes in real time with **Google Calendar**, prevents double bookings, provisions **Google Meet** video links, and sends branded confirmation emails to attendees.

---

## Architecture Overview

```
Visitor opens iampeac.com
    │
    ▼
Click "Schedule 30-Min Call"
    │
    ▼
Booking Client (index.html / script.js)
    │  Queries real-time open slots (24h buffer + Google Calendar free/busy)
    ▼
Google Apps Script Backend (Code.gs)
    ├── Reads Google Calendar events (never allows booking in occupied slots)
    ├── Atomic script lock to prevent race-condition double bookings
    ├── Creates Google Calendar event with Google Meet conference
    └── Sends branded HTML confirmation email with Google Meet link
```

---

## 2-Minute Google Apps Script Backend Setup

Because this uses **Google Apps Script**, it runs directly in your Google Workspace or personal Gmail account (`peter@iampeac.com` or your Google account). No Google Cloud projects, credentials, or billing are required.

### Step 1: Create the Apps Script Project
1. Go to [script.google.com](https://script.google.com) while logged into your Google account.
2. Click **New Project** in the upper-left.
3. Name the project `Peter Ac Meeting Scheduler`.

### Step 2: Paste the Code
1. Open [`Code.gs`](./Code.gs) from this repository and copy the entire contents.
2. In the Google Apps Script editor, replace any default code in `Code.gs` with the copied code.

### Step 3: Enable Google Calendar API (Recommended for Native Google Meet Generation)
1. On the left sidebar of Apps Script, click the **+** button next to **Services**.
2. Select **Google Calendar API** and click **Add**.
*(Note: If not enabled, the script will gracefully fallback to standard CalendarApp).*

### Step 4: Deploy as a Web App
1. In the upper-right corner of the Apps Script editor, click **Deploy** &rarr; **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description**: `Production Meeting Scheduler`
   - **Execute as**: `Me (peter@...)` *(Crucial: This gives the app permission to check your calendar)*
   - **Who has access**: `Anyone` *(Crucial: Allows visitors from your website to see open slots and book)*
4. Click **Deploy**.
5. When prompted, click **Authorize access**, select your Google account, click **Advanced**, and then click **Go to Peter Ac Meeting Scheduler (unsafe)** &rarr; **Allow**.
6. Copy the **Web app URL** (it looks like `https://script.google.com/macros/s/AKfycbx.../exec`).

### Step 5: Connect to the Frontend
1. Open [`script.js`](./script.js) in this repository.
2. In line 18, paste your Web app URL:
   ```javascript
   const GAS_API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
   ```
3. Save the file.

---

## Easily Adjusting Your Schedule & Preferences

You can customize your working schedule at any time by editing the `CONFIG` object at the top of [`Code.gs`](./Code.gs):

```javascript
const CONFIG = {
  // Calendar ID ('primary' targets your main calendar)
  CALENDAR_ID: 'primary',

  // Advance notice buffer in hours (default: 24h)
  ADVANCE_NOTICE_HOURS: 24,

  // Meeting Slot Duration
  SLOT_DURATION_MINUTES: 30,

  // Max days in advance visitors can book
  MAX_DAYS_IN_ADVANCE: 30,

  // Weekly Working Schedule (0 = Sun, 1 = Mon ... 6 = Sat)
  WEEKLY_SCHEDULE: {
    1: { enabled: true,  start: "09:00", end: "17:00" }, // Monday
    2: { enabled: true,  start: "09:00", end: "17:00" }, // Tuesday
    3: { enabled: true,  start: "09:00", end: "17:00" }, // Wednesday
    4: { enabled: true,  start: "09:00", end: "17:00" }, // Thursday
    5: { enabled: true,  start: "09:00", end: "16:00" }, // Friday
    6: { enabled: false, start: "10:00", end: "14:00" }, // Saturday
    0: { enabled: false, start: "10:00", end: "14:00" }  // Sunday
  }
};
```
*Tip: Whenever you modify `Code.gs`, click **Deploy** &rarr; **Manage deployments** &rarr; **Edit** &rarr; choose **New version** &rarr; click **Deploy** to publish the changes.*

---

## Hosting the Booking Page

You can host this booking application in multiple ways:

### Option A: GitHub Pages (Free, Automatic HTTPS)
1. Push this repository to `github.com/peacpeac/meeting-booking`.
2. Go to **Settings** &rarr; **Pages** in GitHub.
3. Under **Branch**, select `main` / `root` and click **Save**.
4. Your booking page will be live at `https://peacpeac.github.io/meeting-booking/`.

### Option B: Custom Subdomain (e.g., `book.iampeac.com`)
1. Create a `CNAME` file containing `book.iampeac.com`.
2. In Porkbun DNS, add a `CNAME` record for `book` pointing to `peacpeac.github.io`.

---

## Local Development & Preview
To run the scheduler locally on your machine:
```bash
python -m http.server 8080
```
Then visit `http://localhost:8080` in your web browser.
