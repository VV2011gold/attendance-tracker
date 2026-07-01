/**
 * attendanceController.js
 * Handler functions for the /api/attendance routes.
 */

const { validationResult } = require('express-validator');
const Attendance = require('../models/Attendance');
const Employee   = require('../models/Employee');

/**
 * GET /api/attendance/month?year=YYYY&month=MM
 * Returns all attendance records for every day in a calendar month,
 * structured as: { employees: [...], days: [1..N], records: { "EMP001": { "2025-06-03": {...} } } }
 * Employees with no records at all are still included (with empty day maps).
 */
const getMonthView = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const year  = parseInt(req.query.year,  10);
    const month = parseInt(req.query.month, 10);   // 1-based

    // Build the date range for the month (padded to YYYY-MM-DD)
    const daysInMonth = new Date(year, month, 0).getDate();  // day 0 of next month = last day of this month
    const pad = (n) => String(n).padStart(2, '0');
    const dateFrom = `${year}-${pad(month)}-01`;
    const dateTo   = `${year}-${pad(month)}-${pad(daysInMonth)}`;

    const monthData = Attendance.findByDateRange(dateFrom, dateTo);
    const employees = Employee.findAll();

    // Index records: empEmployeeId → date → record
    const records = {};
    for (const emp of employees) {
      records[emp.employee_id] = {};
    }
    for (const rec of monthData) {
      if (!records[rec.employee_id]) records[rec.employee_id] = {};
      records[rec.employee_id][rec.date] = {
        id:       rec.id,
        shift:    rec.shift,
        status:   rec.status,
        comments: rec.remarks || null,   // DB column is 'remarks'; expose as 'comments'
      };
    }

    return res.json({
      success: true,
      year,
      month,
      daysInMonth,
      dateFrom,
      dateTo,
      employees,
      records,
    });
  } catch (err) {
    console.error('[Attendance] getMonthView error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve month view' });
  }
};

/**
 * GET /api/attendance?date=YYYY-MM-DD
 * Returns all attendance records for the given date.
 */
const getAttendanceByDate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { date } = req.query;
    const records = Attendance.findByDate(date);
    return res.json({ success: true, date, data: records });
  } catch (err) {
    console.error('[Attendance] getAttendanceByDate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance records' });
  }
};

/**
 * GET /api/attendance/summary?date=YYYY-MM-DD
 * Returns per-shift summary including employees with no record ("Not Entered").
 */
const getSummary = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { date } = req.query;
    const summary = Attendance.getSummary(date);
    return res.json({ success: true, date, data: summary });
  } catch (err) {
    console.error('[Attendance] getSummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve summary' });
  }
};

/**
 * POST /api/attendance
 * Body: { employee_id, date, shift?, status, comments? }
 * 'comments' maps to the 'remarks' DB column for backward compatibility.
 */
const createAttendance = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { employee_id, date, shift, status, comments } = req.body;

  const employee = Employee.findByEmployeeId(employee_id);
  if (!employee) {
    return res.status(404).json({ success: false, message: `Employee '${employee_id}' not found` });
  }

  const existing = Attendance.findByEmployeeAndDate(employee.id, date);
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `Attendance record for employee '${employee_id}' on ${date} already exists. Use PUT to update.`,
    });
  }

  try {
    const { id } = Attendance.create({
      employee_id: employee.id,
      date,
      shift:   shift   || null,
      status,
      remarks: comments || null,
    });
    const created = Attendance.findById(id);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('[Attendance] createAttendance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create attendance record' });
  }
};

/**
 * PUT /api/attendance/:id
 * Updates an existing attendance record.
 * Body: any subset of { status, shift, comments }
 */
const updateAttendance = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const id = parseInt(req.params.id, 10);
  const record = Attendance.findById(id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Attendance record not found' });
  }

  try {
    // Map 'comments' → 'remarks' so the model's allowed-fields list stays correct
    const fields = { ...req.body };
    if ('comments' in fields) {
      fields.remarks = fields.comments;
      delete fields.comments;
    }
    Attendance.update(id, fields);
    const updated = Attendance.findById(id);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Attendance] updateAttendance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update attendance record' });
  }
};

module.exports = { getAttendanceByDate, getSummary, getMonthView, createAttendance, updateAttendance };
