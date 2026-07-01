/**
 * seed.js — employees have no fixed shift; each day's record carries its own shift
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./database');

console.log('[Seed] Starting…');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Employees (no shift field) ────────────────────────────────────────────────
const employees = [
  { name: 'John Smith',    employee_id: 'EMP001', department: 'Engineering' },
  { name: 'Jane Doe',      employee_id: 'EMP002', department: 'Engineering' },
  { name: 'Mark Lee',      employee_id: 'EMP003', department: 'QA'          },
  { name: 'Sarah Johnson', employee_id: 'EMP004', department: 'Design'      },
  { name: 'Alice Brown',   employee_id: 'EMP005', department: 'Operations'  },
  { name: 'Bob Wilson',    employee_id: 'EMP006', department: 'Operations'  },
  { name: 'Carol Davis',   employee_id: 'EMP007', department: 'Support'     },
  { name: 'Dan Miller',    employee_id: 'EMP008', department: 'Support'     },
];

const insertEmployee = db.prepare(`
  INSERT OR IGNORE INTO employees (name, employee_id, department)
  VALUES (?, ?, ?)
`);

db.exec('BEGIN;');
for (const e of employees) insertEmployee.run(e.name, e.employee_id, e.department);
db.exec('COMMIT;');
console.log(`[Seed] Inserted/skipped ${employees.length} employees`);

// ── Fetch PKs ─────────────────────────────────────────────────────────────────
const dbEmployees = db.prepare(`SELECT id, employee_id FROM employees WHERE active = 1`).all();
const empMap = {};
for (const e of dbEmployees) empMap[e.employee_id] = e.id;

// ── Attendance — each day each employee gets a random shift ───────────────────
const SHIFTS   = ['7:00 AM', '4:30 AM'];
const STATUSES = ['On Shift 7AM', 'On Shift 7AM', 'On Shift 4:30AM', 'Week Off', 'Holiday', 'On Leave', 'Half Day', 'Comp Off'];

const insertRecord = db.prepare(`
  INSERT OR IGNORE INTO attendance_records (employee_id, date, shift, status, check_in, check_out, remarks)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
db.exec('BEGIN;');
for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
  const date = daysAgo(dayOffset);
  for (const [empId, pk] of Object.entries(empMap)) {
    const shift  = SHIFTS[Math.floor(Math.random() * SHIFTS.length)];
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    insertRecord.run(pk, date, shift, status, null, null,
      status === 'On Leave' ? 'Annual leave' : null);
    count++;
  }
}
db.exec('COMMIT;');
console.log(`[Seed] Inserted/skipped ${count} attendance records`);
console.log('[Seed] Done.');
