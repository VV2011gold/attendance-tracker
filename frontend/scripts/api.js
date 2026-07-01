/**
 * api.js
 * Thin wrapper around the Attendance Tracker REST API.
 * All methods return parsed JSON or throw on HTTP/network errors.
 */

const API_BASE = '/api';

/** Generic fetch wrapper — throws on non-2xx responses */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let body;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok) {
    const message = body.message || body.errors?.[0]?.msg || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}

// ── Employee endpoints ────────────────────────────────────────────────────────

/** Fetch all active employees */
export const getEmployees = () => apiFetch('/employees');

export const createEmployee = (data) =>
  apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) });

export const updateEmployee = (pk, data) =>
  apiFetch(`/employees/${pk}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteEmployee = (pk) =>
  apiFetch(`/employees/${pk}`, { method: 'DELETE' });

// ── Attendance endpoints ──────────────────────────────────────────────────────

/**
 * Fetch the full month view
 * @param {number} year
 * @param {number} month  1-based
 */
export const getMonthView = (year, month) =>
  apiFetch(`/attendance/month?year=${year}&month=${month}`);

/**
 * Fetch attendance records for a date
 * @param {string} date  YYYY-MM-DD
 */
export const getAttendance = (date) =>
  apiFetch(`/attendance?date=${encodeURIComponent(date)}`);

/**
 * Fetch summary (all employees, including those with no record)
 * @param {string} date  YYYY-MM-DD
 */
export const getAttendanceSummary = (date) =>
  apiFetch(`/attendance/summary?date=${encodeURIComponent(date)}`);

/**
 * Submit a new attendance record
 * @param {{ employee_id: string, date: string, status: string, check_in?, check_out?, remarks? }} data
 */
export const createAttendance = (data) =>
  apiFetch('/attendance', { method: 'POST', body: JSON.stringify(data) });

/**
 * Update an existing attendance record
 * @param {number} id
 * @param {object} data
 */
export const updateAttendance = (id, data) =>
  apiFetch(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) });

/**
 * Delete an attendance record by id
 * @param {number} id
 */
export const deleteAttendance = (id) =>
  apiFetch(`/attendance/${id}`, { method: 'DELETE' });
