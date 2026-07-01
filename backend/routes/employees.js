/**
 * employees.js — shift column removed; employees are shift-agnostic
 */

const express    = require('express');
const { body, param } = require('express-validator');
const {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require('../controllers/employeeController');

const router = express.Router();

const nameValidator = body('name')
  .trim().notEmpty().withMessage('name is required')
  .isLength({ max: 120 }).withMessage('name must be ≤ 120 characters');

const employeeIdValidator = body('employee_id')
  .trim().notEmpty().withMessage('employee_id is required')
  .isLength({ max: 50 }).withMessage('employee_id must be ≤ 50 characters')
  .matches(/^[A-Za-z0-9_-]+$/).withMessage('employee_id may only contain letters, digits, hyphens, and underscores');

const emailValidator = body('email')
  .optional({ nullable: true, checkFalsy: true })
  .isEmail().withMessage('email must be a valid address');

const departmentValidator = body('department')
  .optional({ nullable: true, checkFalsy: true })
  .isLength({ max: 100 }).withMessage('department must be ≤ 100 characters');

const idParamValidator = param('id')
  .isInt({ min: 1 }).withMessage('id must be a positive integer');

router.get('/', listEmployees);

router.post(
  '/',
  [nameValidator, employeeIdValidator, emailValidator, departmentValidator],
  createEmployee
);

router.put(
  '/:id',
  [
    idParamValidator,
    body('name').optional().trim().notEmpty().isLength({ max: 120 }),
    body('employee_id').optional().trim().notEmpty().isLength({ max: 50 }).matches(/^[A-Za-z0-9_-]+$/),
    emailValidator,
    departmentValidator,
  ],
  updateEmployee
);

router.delete('/:id', [idParamValidator], deleteEmployee);

module.exports = router;
