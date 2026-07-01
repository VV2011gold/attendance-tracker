# Attendance Tracker

A full-stack team attendance tracking system with an Excel-like web interface, REST API, and automated daily Slack notifications.

---

## Features

- **Spreadsheet-style UI** — inline cell editing, colour-coded rows, bulk status updates
- **Two shift support** — 7:00 AM and 4:30 AM shifts
- **Complete REST API** — full CRUD for employees and attendance records
- **Input validation** — duplicate detection, date format checks, enum validation
- **Daily Slack reminders** — Block Kit messages sent via `node-cron` at a configurable time
- **CSV export** — one-click download of the current filtered view
- **Search, filter, paginate** — by name, ID, shift, or status
- **Seed script** — pre-populates 8 employees and 7 days of random attendance data
- **SQLite storage** — zero-config, file-based, WAL mode for performance

---

## Project Structure

```
attendance-tracker/
├── backend/
│   ├── server.js                  ← Express app entry point
│   ├── .env.example               ← Environment variable template
│   ├── routes/
│   │   ├── employees.js           ← /api/employees routes + validation
│   │   └── attendance.js          ← /api/attendance routes + validation
│   ├── controllers/
│   │   ├── employeeController.js  ← Employee business logic
│   │   └── attendanceController.js← Attendance business logic
│   ├── models/
│   │   ├── Employee.js            ← SQLite data-access for employees
│   │   └── Attendance.js          ← SQLite data-access for attendance
│   ├── scheduler/
│   │   └── slackReminder.js       ← node-cron + Slack Block Kit sender
│   └── db/
│       ├── database.js            ← DB connection + schema bootstrap
│       ├── schema.sql             ← Table definitions (idempotent)
│       └── seed.js                ← Sample data seed script
├── frontend/
│   ├── index.html                 ← Single-page application shell
│   ├── styles/
│   │   └── styles.css             ← All styles (no external deps)
│   └── scripts/
│       ├── app.js                 ← Bootstrap, modals, employee CRUD
│       ├── grid.js                ← Grid render, edit, filter, export
│       └── api.js                 ← fetch() wrapper for all endpoints
├── package.json
└── README.md
```

---

## Quick Start

### Prerequisites

- **Node.js ≥ 22.5** (uses the built-in `node:sqlite` module — no native compilation required)
- No database server required (SQLite is built into Node.js)

### 1. Install Dependencies

```bash
cd attendance-tracker
npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values (see [Environment Variables](#environment-variables) below).

### 3. Seed Sample Data (Optional)

```bash
npm run seed
```

This creates 8 sample employees (4 per shift) and 7 days of randomised attendance records.

### 4. Start the Server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Open **http://127.0.0.1:3000** in your browser.

---

## Environment Variables

| Variable          | Required | Default               | Description |
|-------------------|----------|-----------------------|-------------|
| `DATABASE_PATH`   | No       | `./attendance.db`     | Path to the SQLite file (relative to project root) |
| `SLACK_BOT_TOKEN` | Yes*     | —                     | Slack bot token starting with `xoxb-` |
| `SLACK_CHANNEL_ID`| Yes*     | —                     | Target channel ID (`C…`) or user DM ID (`U…`) |
| `REMINDER_TIME`   | No       | `30 7 * * *`          | node-cron expression for the daily reminder (7:30 AM) |
| `CRON_TIMEZONE`   | No       | `America/New_York`    | IANA timezone for the cron job |
| `PORT`            | No       | `3000`                | HTTP port to listen on |

\* Required only for Slack notifications. The app runs fine without them; reminders are skipped with a warning.

---

## Slack App Setup

1. **Create a Slack App** at [api.slack.com/apps](https://api.slack.com/apps) → "Create New App" → "From scratch"

2. **Add Bot Token Scopes** under *OAuth & Permissions → Scopes → Bot Token Scopes*:
   - `chat:write` — post messages
   - `chat:write.public` — post to channels the bot hasn't joined (optional)

3. **Install the App** to your workspace → copy the **Bot User OAuth Token** (`xoxb-…`)

4. **Invite the bot** to your target channel:
   ```
   /invite @YourBotName
   ```

5. **Copy the Channel ID** — right-click the channel name → *View channel details* → scroll to bottom for the ID (starts with `C`)

6. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` in `backend/.env`

### Example Slack Message

```
📅 Attendance Report — Monday, June 10, 2025

🕖 7:00 AM Shift
✅ John Smith   — Present (Check-in: 06:58)
❌ Jane Doe     — Absent
⚠️ Mark Lee     — Late (Check-in: 07:22)
📊 Summary: 2 Present | 1 Absent | 1 Late

🕓 4:30 AM Shift
✅ Alice Brown  — Present (Check-in: 04:28)
🔵 Bob Wilson   — On Leave — Annual leave
📊 Summary: 1 Present | 1 On Leave
```

---

## API Reference

All endpoints return `{ success: true, data: … }` on success or `{ success: false, message: "…" }` on error.

### Employees

| Method | Path                    | Description |
|--------|-------------------------|-------------|
| GET    | `/api/employees`        | List all active employees |
| POST   | `/api/employees`        | Create employee |
| PUT    | `/api/employees/:id`    | Update employee |
| DELETE | `/api/employees/:id`    | Soft-delete employee |

**POST/PUT body fields:**

| Field         | Type   | Required | Notes |
|---------------|--------|----------|-------|
| `name`        | string | Yes      | Max 120 chars |
| `employee_id` | string | Yes      | Unique, alphanumeric + `_-`, max 50 |
| `shift`       | string | Yes      | `"7:00 AM"` or `"4:30 AM"` |
| `email`       | string | No       | Valid email address |
| `department`  | string | No       | Max 100 chars |

### Attendance

| Method | Path                               | Description |
|--------|------------------------------------|-------------|
| GET    | `/api/attendance?date=YYYY-MM-DD`  | Records for a date |
| GET    | `/api/attendance/summary?date=…`   | Per-shift summary (includes missing records) |
| POST   | `/api/attendance`                  | Create record |
| PUT    | `/api/attendance/:id`              | Update record |

**POST body fields:**

| Field         | Type   | Required | Notes |
|---------------|--------|----------|-------|
| `employee_id` | string | Yes      | Employee's string ID (e.g. `"EMP001"`) |
| `date`        | string | Yes      | `YYYY-MM-DD` format |
| `status`      | string | Yes      | `Present` \| `Absent` \| `Late` \| `On Leave` \| `Half Day` |
| `check_in`    | string | No       | `HH:MM` (24-hour) |
| `check_out`   | string | No       | `HH:MM` (24-hour) |
| `remarks`     | string | No       | Max 500 chars |

**Example requests:**

```bash
# Add employee
curl -X POST http://127.0.0.1:3000/api/employees \
  -H "Content-Type: application/json" \
  -d '{"name":"John Smith","employee_id":"EMP001","shift":"7:00 AM","department":"Engineering"}'

# Submit attendance
curl -X POST http://127.0.0.1:3000/api/attendance \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"EMP001","date":"2025-06-10","status":"Present","check_in":"06:58"}'

# Get attendance for a date
curl "http://127.0.0.1:3000/api/attendance?date=2025-06-10"

# Get shift summary
curl "http://127.0.0.1:3000/api/attendance/summary?date=2025-06-10"
```

---

## Frontend Usage

| Action | How |
|--------|-----|
| **Change date** | Use the date picker at the top — grid reloads automatically |
| **Edit check-in/check-out** | Click any cell in the Check-in or Check-out column |
| **Change status** | Use the dropdown in the "Quick Status" column |
| **Edit remarks** | Click the remarks cell |
| **Bulk update** | Check multiple rows → set status in the yellow bar → click Apply |
| **Add employee** | Click "+ Add Employee" button (top right) |
| **Manage employees** | Click "Manage Employees" to view, edit, or remove |
| **Export** | Click "Export CSV" to download the current filtered view |
| **Filter** | Use the Shift / Status dropdowns or search bar; click Clear to reset |

### Row Colours

| Colour | Status |
|--------|--------|
| Green  | Present |
| Red    | Absent |
| Yellow | Late |
| Blue   | On Leave |
| Purple | Half Day |
| Grey   | Not Entered |

---

## Development Notes

- **SQLite WAL mode** is enabled for better concurrent read performance
- **Soft delete** is used for employees — records are preserved for historical reports
- **Timestamps** are stored in UTC (`datetime('now')` in SQLite = UTC); the UI displays times as-entered
- **No build step** — the frontend uses native ES modules (`type="module"`) served directly by Express
- The seed script uses `INSERT OR IGNORE` so it is safe to run multiple times

---

## Security Notes

- The server binds to `127.0.0.1` by default — set `HOST=0.0.0.0` only behind a reverse proxy
- The Slack bot token is read from the environment — never commit `.env` to version control
- Input is validated on every endpoint with `express-validator` before any DB operation
- Error responses return generic messages; stack traces are logged server-side only

---

## License

MIT
