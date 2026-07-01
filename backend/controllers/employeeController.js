/**
 * employeeController.js — shift removed from employee CRUD
 */

const { validationResult } = require('express-validator');
const Employee = require('../models/Employee');

const listEmployees = (req, res) => {
  try {
    return res.json({ success: true, data: Employee.findAll() });
  } catch (err) {
    console.error('[Employee] listEmployees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employees' });
  }
};

const createEmployee = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { name, employee_id, email, department } = req.body;

  if (Employee.findByEmployeeId(employee_id)) {
    return res.status(409).json({ success: false, message: `Employee ID '${employee_id}' already exists` });
  }

  try {
    const { id } = Employee.create({ name, employee_id, email, department });
    return res.status(201).json({ success: true, data: Employee.findById(id) });
  } catch (err) {
    console.error('[Employee] createEmployee error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
};

const updateEmployee = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const id = parseInt(req.params.id, 10);
  const employee = Employee.findById(id);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

  if (req.body.employee_id && req.body.employee_id !== employee.employee_id) {
    const conflict = Employee.findByEmployeeId(req.body.employee_id);
    if (conflict) return res.status(409).json({ success: false, message: `Employee ID '${req.body.employee_id}' is already taken` });
  }

  try {
    Employee.update(id, req.body);
    return res.json({ success: true, data: Employee.findById(id) });
  } catch (err) {
    console.error('[Employee] updateEmployee error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
};

const deleteEmployee = (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Employee.findById(id)) return res.status(404).json({ success: false, message: 'Employee not found' });

  try {
    Employee.delete(id);
    return res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('[Employee] deleteEmployee error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete employee' });
  }
};

module.exports = { listEmployees, createEmployee, updateEmployee, deleteEmployee };
