/**
 * Employee.js — no shift column; shift lives on attendance_records
 */

const db = require('../db/database');

const Employee = {

  findAll() {
    return db
      .prepare(`SELECT * FROM employees WHERE active = 1 ORDER BY name ASC`)
      .all();
  },

  findById(id) {
    return db
      .prepare(`SELECT * FROM employees WHERE id = ? AND active = 1`)
      .get(id);
  },

  findByEmployeeId(employeeId) {
    return db
      .prepare(`SELECT * FROM employees WHERE employee_id = ? AND active = 1`)
      .get(employeeId);
  },

  create({ name, employee_id, email = null, department = null }) {
    const result = db.prepare(`
      INSERT INTO employees (name, employee_id, email, department)
      VALUES (?, ?, ?, ?)
    `).run(name, employee_id, email, department);
    return { id: Number(result.lastInsertRowid) };
  },

  update(id, fields) {
    const allowed = ['name', 'employee_id', 'email', 'department'];
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
      .prepare(`UPDATE employees SET ${setClauses.join(', ')} WHERE id = ? AND active = 1`)
      .run(...values);
    return { changes: result.changes };
  },

  delete(id) {
    const result = db
      .prepare(`UPDATE employees SET active = 0, updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    return { changes: result.changes };
  },
};

module.exports = Employee;
