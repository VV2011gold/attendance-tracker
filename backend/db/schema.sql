-- Attendance Tracker Database Schema
-- Using SQLite for portable, zero-config storage
-- v2: shift moved from employees to attendance_records (per-day shift assignment)

-- Employees table — no shift column; shift is recorded per attendance day
CREATE TABLE IF NOT EXISTS employees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  employee_id TEXT    NOT NULL UNIQUE,
  email       TEXT,
  department  TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Attendance records table — shift is optional (UI no longer requires it)
CREATE TABLE IF NOT EXISTS attendance_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  shift       TEXT    CHECK(shift IS NULL OR shift IN ('7:00 AM', '4:30 AM')),
  status      TEXT    NOT NULL CHECK(status IN ('On Shift 7AM','On Shift 4:30AM','Week Off','Holiday','On Leave','Half Day','Comp Off')),
  check_in    TEXT,
  check_out   TEXT,
  remarks     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status   ON attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_shift    ON attendance_records(shift);
