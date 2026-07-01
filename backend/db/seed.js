/**
 * seed.js — Real team data seeded from screenshot (June 2026)
 *
 * Employees : Jayesh, Parinitha, Prakriti, Ritika, Vignesh, Vijayshanthi
 * Attendance: June 2026 — days 20-30 as visible in the screenshot
 *
 * Run: node backend/db/seed.js
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./database');

console.log('[Seed] Starting…');

// ── Employees ─────────────────────────────────────────────────────────────────
const employees = [
  { name: 'Jayesh',       employee_id: 'EMP001' },
  { name: 'Parinitha',    employee_id: 'EMP002' },
  { name: 'Prakriti',     employee_id: 'EMP003' },
  { name: 'Ritika',       employee_id: 'EMP004' },
  { name: 'Vignesh',      employee_id: 'EMP005' },
  { name: 'Vijayshanthi', employee_id: 'EMP006' },
];

const insertEmployee = db.prepare(`
  INSERT OR IGNORE INTO employees (name, employee_id)
  VALUES (?, ?)
`);

db.exec('BEGIN;');
for (const e of employees) insertEmployee.run(e.name, e.employee_id);
db.exec('COMMIT;');
console.log(`[Seed] Inserted/skipped ${employees.length} employees`);

// ── Fetch PKs ─────────────────────────────────────────────────────────────────
const dbEmployees = db.prepare(`SELECT id, employee_id FROM employees WHERE active = 1`).all();
const empMap = {};
for (const e of dbEmployees) empMap[e.employee_id] = e.id;

// ── Attendance data from screenshot (June 2026) ───────────────────────────────
// Format: { employee_id, date: 'YYYY-MM-DD', status }
// S7 = On Shift 7AM  |  S4 = On Shift 4:30AM

const S7 = 'On Shift 7AM';
const S4 = 'On Shift 4:30AM';

// Read directly from the screenshot row by row, day by day
// Days visible: 20(Fri), 21(Sat), 22(Sun), 23(Mon), 24(Tue), 25(Wed), 26(Thu), 27(Fri), 28(Sat), 29(Sun), 30(Mon)

const attendance = [
  // ── Jayesh ──────────────────────────────────────────────────────────────────
  // day 20 = S7, 22-28 = S7, 30 = S7  (no entry on 21,29)
  { emp: 'EMP001', date: '2026-06-20', status: S7 },
  { emp: 'EMP001', date: '2026-06-22', status: S7 },
  { emp: 'EMP001', date: '2026-06-23', status: S7 },
  { emp: 'EMP001', date: '2026-06-24', status: S7 },
  { emp: 'EMP001', date: '2026-06-25', status: S7 },
  { emp: 'EMP001', date: '2026-06-26', status: S7 },
  { emp: 'EMP001', date: '2026-06-27', status: S7 },
  { emp: 'EMP001', date: '2026-06-28', status: S7 },
  { emp: 'EMP001', date: '2026-06-30', status: S7 },

  // ── Parinitha ────────────────────────────────────────────────────────────────
  // day 21 = S4, 22-28 = S7, 29 = S7  (summary 7S7 1S4)
  { emp: 'EMP002', date: '2026-06-21', status: S4 },
  { emp: 'EMP002', date: '2026-06-22', status: S7 },
  { emp: 'EMP002', date: '2026-06-23', status: S7 },
  { emp: 'EMP002', date: '2026-06-24', status: S7 },
  { emp: 'EMP002', date: '2026-06-25', status: S7 },
  { emp: 'EMP002', date: '2026-06-26', status: S7 },
  { emp: 'EMP002', date: '2026-06-27', status: S7 },
  { emp: 'EMP002', date: '2026-06-28', status: S7 },
  { emp: 'EMP002', date: '2026-06-29', status: S7 },

  // ── Prakriti ─────────────────────────────────────────────────────────────────
  // day 21 = S4, 22-27 = S7  (summary 6S7 1S4)
  { emp: 'EMP003', date: '2026-06-21', status: S4 },
  { emp: 'EMP003', date: '2026-06-22', status: S7 },
  { emp: 'EMP003', date: '2026-06-23', status: S7 },
  { emp: 'EMP003', date: '2026-06-24', status: S7 },
  { emp: 'EMP003', date: '2026-06-25', status: S7 },
  { emp: 'EMP003', date: '2026-06-26', status: S7 },
  { emp: 'EMP003', date: '2026-06-27', status: S7 },

  // ── Ritika ───────────────────────────────────────────────────────────────────
  // day 21 = S4, 22-27 = S7, 30 = S4  (summary 6S7 2S4)
  { emp: 'EMP004', date: '2026-06-21', status: S4 },
  { emp: 'EMP004', date: '2026-06-22', status: S7 },
  { emp: 'EMP004', date: '2026-06-23', status: S7 },
  { emp: 'EMP004', date: '2026-06-24', status: S7 },
  { emp: 'EMP004', date: '2026-06-25', status: S7 },
  { emp: 'EMP004', date: '2026-06-26', status: S7 },
  { emp: 'EMP004', date: '2026-06-27', status: S7 },
  { emp: 'EMP004', date: '2026-06-30', status: S4 },

  // ── Vignesh ──────────────────────────────────────────────────────────────────
  // day 21 = S4, 22-27 = S7  (summary 6S7 1S4)
  { emp: 'EMP005', date: '2026-06-21', status: S4 },
  { emp: 'EMP005', date: '2026-06-22', status: S7 },
  { emp: 'EMP005', date: '2026-06-23', status: S7 },
  { emp: 'EMP005', date: '2026-06-24', status: S7 },
  { emp: 'EMP005', date: '2026-06-25', status: S7 },
  { emp: 'EMP005', date: '2026-06-26', status: S7 },
  { emp: 'EMP005', date: '2026-06-27', status: S7 },

  // ── Vijayshanthi ─────────────────────────────────────────────────────────────
  // day 20 = S7, 21 = S4, 22-27 = S7, 29 = S7  (summary 8S7 1S4)
  { emp: 'EMP006', date: '2026-06-20', status: S7 },
  { emp: 'EMP006', date: '2026-06-21', status: S4 },
  { emp: 'EMP006', date: '2026-06-22', status: S7 },
  { emp: 'EMP006', date: '2026-06-23', status: S7 },
  { emp: 'EMP006', date: '2026-06-24', status: S7 },
  { emp: 'EMP006', date: '2026-06-25', status: S7 },
  { emp: 'EMP006', date: '2026-06-26', status: S7 },
  { emp: 'EMP006', date: '2026-06-27', status: S7 },
  { emp: 'EMP006', date: '2026-06-29', status: S7 },
];

const insertRecord = db.prepare(`
  INSERT OR IGNORE INTO attendance_records (employee_id, date, status)
  VALUES (?, ?, ?)
`);

let count = 0;
db.exec('BEGIN;');
for (const rec of attendance) {
  const pk = empMap[rec.emp];
  if (!pk) { console.warn(`[Seed] Unknown employee_id: ${rec.emp}`); continue; }
  insertRecord.run(pk, rec.date, rec.status);
  count++;
}
db.exec('COMMIT;');

console.log(`[Seed] Inserted/skipped ${count} attendance records`);
console.log('[Seed] Done. Open June 2026 in the app to see your data.');
