/**
 * Attendance.js
 * shift is now a column on attendance_records (per-day, not per-employee).
 */

const db = require('../db/database');

const Attendance = {

  /**
   * All attendance records for a date range, joined with employee info.
   * @param {string} dateFrom  YYYY-MM-DD
   * @param {string} dateTo    YYYY-MM-DD
   */
  findByDateRange(dateFrom, dateTo) {
    return db.prepare(`
      SELECT
        ar.id,
        ar.date,
        ar.shift,
        ar.status,
        ar.check_in,
        ar.check_out,
        ar.remarks,
        e.id          AS employee_pk,
        e.employee_id AS employee_id,
        e.name        AS employee_name,
        e.department  AS department
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.date >= ? AND ar.date <= ? AND e.active = 1
      ORDER BY ar.shift ASC, e.name ASC, ar.date ASC
    `).all(dateFrom, dateTo);
  },

  findByDate(date) {
    return db.prepare(`
      SELECT
        ar.id,
        ar.date,
        ar.shift,
        ar.status,
        ar.check_in,
        ar.check_out,
        ar.remarks,
        e.id          AS employee_pk,
        e.employee_id AS employee_id,
        e.name        AS employee_name,
        e.department  AS department
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.date = ? AND e.active = 1
      ORDER BY ar.shift ASC, e.name ASC
    `).all(date);
  },

  findById(id) {
    return db.prepare(`
      SELECT ar.*, e.name AS employee_name, e.employee_id
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = ?
    `).get(id);
  },

  findByEmployeeAndDate(employeePk, date) {
    return db.prepare(`
      SELECT * FROM attendance_records
      WHERE employee_id = ? AND date = ?
    `).get(employeePk, date);
  },

  /**
   * Create a new attendance record.
   * @param {{ employee_id, date, shift, status, check_in?, check_out?, remarks? }} data
   */
  create({ employee_id, date, shift, status, check_in = null, check_out = null, remarks = null }) {
    const result = db.prepare(`
      INSERT INTO attendance_records (employee_id, date, shift, status, check_in, check_out, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(employee_id, date, shift, status, check_in, check_out, remarks);
    return { id: Number(result.lastInsertRowid) };
  },

  /**
   * Update an existing record — shift can be changed per-day.
   * @param {number} id
   * @param {{ shift?, status?, check_in?, check_out?, remarks? }} fields
   */
  update(id, fields) {
    const allowed = ['shift', 'status', 'check_in', 'check_out', 'remarks'];
    const setClauses = [];
    const values    = [];

    for (const key of allowed) {
      if (key in fields) {
        setClauses.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (setClauses.length === 0) return { changes: 0 };
    setClauses.push(`updated_at = datetime('now')`);
    values.push(id);

    const result = db
      .prepare(`UPDATE attendance_records SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);
    return { changes: result.changes };
  },

  /**
   * Per-shift summary for a date — used by the Slack reminder.
   * Employees with no record appear as "Not Entered" under the shift
   * they last worked; if they have no history at all they are listed
   * under both shifts is ambiguous — we simply list them without a shift group.
   */
  getSummary(date) {
    // All active employees with their record for the date (LEFT JOIN)
    const rows = db.prepare(`
      SELECT
        e.id          AS employee_pk,
        e.employee_id AS employee_id,
        e.name        AS employee_name,
        ar.shift      AS shift,
        ar.status     AS status,
        ar.check_in   AS check_in,
        ar.check_out  AS check_out,
        ar.remarks    AS remarks
      FROM employees e
      LEFT JOIN attendance_records ar ON ar.employee_id = e.id AND ar.date = ?
      WHERE e.active = 1
      ORDER BY ar.shift ASC, e.name ASC
    `).all(date);

    const summary = {};
    for (const row of rows) {
      const shiftKey = row.shift || 'Unknown';
      if (!summary[shiftKey]) {
        summary[shiftKey] = {
          employees: [],
          counts: { Present: 0, Absent: 0, Late: 0, 'On Leave': 0, 'Half Day': 0, 'Not Entered': 0 },
        };
      }
      const effectiveStatus = row.status || 'Not Entered';
      summary[shiftKey].employees.push({ ...row, status: effectiveStatus });
      summary[shiftKey].counts[effectiveStatus] =
        (summary[shiftKey].counts[effectiveStatus] || 0) + 1;
    }

    return summary;
  },
};

module.exports = Attendance;
