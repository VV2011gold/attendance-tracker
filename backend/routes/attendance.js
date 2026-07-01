/**
 * attendance.js — shift is now required in POST body; optional in PUT
 * Route order: /summary and /month must appear before /:id
 */

const express = require('express');
const { body, query, param } = require('express-validator');
const {
  getAttendanceByDate,
  getSummary,
  getMonthView,
  createAttendance,
  updateAttendance,
} = require('../controllers/attendanceController');

const router = express.Router();

const VALID_STATUSES = ['On Shift 7AM', 'On Shift 4:30AM', 'Week Off', 'Holiday', 'On Leave', 'Half Day', 'Comp Off'];
const VALID_SHIFTS   = ['7:00 AM', '4:30 AM'];

const isValidDate = (val) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(val + 'T00:00:00Z');
  return !isNaN(d.getTime());
};

// GET /api/attendance?date=YYYY-MM-DD
router.get(
  '/',
  [query('date').notEmpty().custom(isValidDate).withMessage('date must be YYYY-MM-DD')],
  getAttendanceByDate
);

// GET /api/attendance/summary?date=YYYY-MM-DD
router.get(
  '/summary',
  [query('date').notEmpty().custom(isValidDate).withMessage('date must be YYYY-MM-DD')],
  getSummary
);

// GET /api/attendance/month?year=YYYY&month=MM
router.get(
  '/month',
  [
    query('year').notEmpty().isInt({ min: 2000, max: 2100 }).withMessage('year must be 2000–2100'),
    query('month').notEmpty().isInt({ min: 1, max: 12 }).withMessage('month must be 1–12'),
  ],
  getMonthView
);

// POST /api/attendance
router.post(
  '/',
  [
    body('employee_id').trim().notEmpty().withMessage('employee_id is required'),
    body('date').notEmpty().custom(isValidDate).withMessage('date must be YYYY-MM-DD'),
    body('shift').optional({ nullable: true, checkFalsy: true }).isIn(VALID_SHIFTS).withMessage(`shift must be one of: ${VALID_SHIFTS.join(', ')}`),
    body('status').notEmpty().isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
    body('comments').optional({ nullable: true, checkFalsy: true }).isLength({ max: 500 }),
  ],
  createAttendance
);

// DELETE /api/attendance/:id
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const id  = parseInt(req.params.id, 10);
    const rec = require('../models/Attendance').findById(id);
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found' });
    const db  = require('../db/database');
    db.prepare('DELETE FROM attendance_records WHERE id = ?').run(id);
    return res.json({ success: true });
  }
);

// PUT /api/attendance/:id
router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
    body('shift').optional({ nullable: true }).isIn(VALID_SHIFTS).withMessage(`shift must be one of: ${VALID_SHIFTS.join(', ')}`),
    body('status').optional().isIn(VALID_STATUSES).withMessage(`status must be one of: ${VALID_STATUSES.join(', ')}`),
    body('comments').optional({ nullable: true, checkFalsy: true }).isLength({ max: 500 }),
  ],
  updateAttendance
);

module.exports = router;
