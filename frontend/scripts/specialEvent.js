/**
 * specialEvent.js
 * "Add Special Event" modal — bulk-assign a status to one or more employees
 * across a date range, with optional day-of-week recurrence.
 *
 * Exports: initSpecialEvent()
 */

import { getEmployees, createAttendance, updateAttendance } from './api.js';
import { showToast } from './app.js';

// Live reference to employees (refreshed each time modal opens)
let _employees = [];

// ── Public init ──────────────────────────────────────────────────────────────

export function initSpecialEvent(onDone) {
  // "+" button in header
  document.getElementById('addEventBtn').addEventListener('click', () => openEventModal(onDone));

  // Close / Cancel
  document.getElementById('eventModalClose').addEventListener('click', closeEventModal);
  document.getElementById('eventModalCancel').addEventListener('click', closeEventModal);
  document.getElementById('eventModal').addEventListener('click', (e) => {
    if (e.target.id === 'eventModal') closeEventModal();
  });

  // Multiple Dates toggle
  document.getElementById('eventMultipleDates').addEventListener('change', onMultipleDatesChange);

  // Repeats checkbox
  document.getElementById('eventRepeats').addEventListener('change', (e) => {
    document.getElementById('eventRepeatsBody').style.display = e.target.checked ? 'block' : 'none';
  });

  // Select All employees
  document.getElementById('eventEmpAll').addEventListener('change', (e) => {
    document.querySelectorAll('.event-emp-cb').forEach((cb) => { cb.checked = e.target.checked; });
  });

  // Add / submit
  document.getElementById('eventSaveBtn').addEventListener('click', () => handleEventSave(onDone));
}

// ── Open / close ─────────────────────────────────────────────────────────────

async function openEventModal(onDone) {
  // Reset form
  document.getElementById('eventStatus').value      = '';
  document.getElementById('eventStartDate').value   = '';
  document.getElementById('eventStopDate').value    = '';
  document.getElementById('eventRecurStop').value   = '';
  document.getElementById('eventComments').value    = '';
  document.getElementById('eventMultipleDates').checked = false;
  document.getElementById('eventRepeats').checked   = false;
  document.getElementById('eventEmpAll').checked    = false;
  document.getElementById('eventStopDateRow').style.display    = 'none';
  document.getElementById('eventRepeatsSection').style.display = 'none';
  document.getElementById('eventRepeatsBody').style.display    = 'none';
  document.querySelectorAll('.dow-cb').forEach((cb) => { cb.checked = false; });

  // Load employees
  const saveBtn = document.getElementById('eventSaveBtn');
  saveBtn.disabled = true;
  try {
    const res = await getEmployees();
    _employees = res.data || [];
    renderEmployeeList();
  } catch (err) {
    showToast('Failed to load employees: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }

  document.getElementById('eventModal').style.display = 'flex';
}

function closeEventModal() {
  document.getElementById('eventModal').style.display = 'none';
}

function onMultipleDatesChange(e) {
  const on = e.target.checked;
  document.getElementById('eventStopDateRow').style.display    = on ? '' : 'none';
  document.getElementById('eventRepeatsSection').style.display = on ? '' : 'none';
  if (!on) {
    document.getElementById('eventRepeats').checked = false;
    document.getElementById('eventRepeatsBody').style.display  = 'none';
  }
}

// ── Employee checkbox list ────────────────────────────────────────────────────

function renderEmployeeList() {
  const list = document.getElementById('eventEmpList');
  if (!_employees.length) {
    list.innerHTML = '<p style="color:var(--color-muted);font-size:.8rem;padding:4px 0">No employees found.</p>';
    return;
  }
  list.innerHTML = _employees.map((e) => `
    <label class="emp-cb-row">
      <input type="checkbox" class="event-emp-cb" value="${escHtml(e.employee_id)}" />
      <span class="emp-name-text">${escHtml(e.name)}</span>
    </label>
  `).join('');

  // Keep "Select All" checkbox in sync
  list.querySelectorAll('.event-emp-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const all  = list.querySelectorAll('.event-emp-cb');
      const chk  = list.querySelectorAll('.event-emp-cb:checked');
      document.getElementById('eventEmpAll').checked       = chk.length === all.length;
      document.getElementById('eventEmpAll').indeterminate = chk.length > 0 && chk.length < all.length;
    });
  });
}

// ── Save handler ──────────────────────────────────────────────────────────────

async function handleEventSave(onDone) {
  // ── Validate ──
  const status    = document.getElementById('eventStatus').value;
  const startDate = document.getElementById('eventStartDate').value;
  const multi     = document.getElementById('eventMultipleDates').checked;
  const stopDate  = document.getElementById('eventStopDate').value;
  const repeats   = document.getElementById('eventRepeats').checked;
  const recurStop = document.getElementById('eventRecurStop').value;
  const comments  = document.getElementById('eventComments').value.trim() || null;

  const selectedEmpIds = [...document.querySelectorAll('.event-emp-cb:checked')].map((cb) => cb.value);

  if (!selectedEmpIds.length)    { showToast('Select at least one team member', 'error'); return; }
  if (!status)                   { showToast('Choose a status/event type', 'error'); return; }
  if (!startDate)                { showToast('Enter a start date', 'error'); return; }
  if (multi && !stopDate)        { showToast('Enter a stop date', 'error'); return; }
  if (multi && stopDate < startDate) { showToast('Stop date must be after start date', 'error'); return; }

  // ── Build list of dates to apply ──
  const dates = buildDateList({ startDate, multi, stopDate, repeats, recurStop });
  if (!dates.length) { showToast('No dates match the recurrence rules', 'error'); return; }

  // ── Save ──
  const saveBtn = document.getElementById('eventSaveBtn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Adding…';

  let ok = 0, fail = 0;

  // We need the employee PK (integer id) for createAttendance, which expects employee_id string
  // (the backend looks up by string employee_id). Map empId → string directly.
  for (const empId of selectedEmpIds) {
    for (const date of dates) {
      try {
        // Try create; if 409 conflict, update instead
        try {
          await createAttendance({ employee_id: empId, date, status, comments });
          ok++;
        } catch (createErr) {
          if (createErr.message.includes('already exists') || createErr.message.includes('409') || createErr.message.includes('Use PUT')) {
            // Find existing record id from grid state if available, otherwise re-fetch
            const existingId = await findRecordId(empId, date);
            if (existingId) {
              await updateAttendance(existingId, { status, comments });
              ok++;
            } else {
              fail++;
            }
          } else {
            fail++;
          }
        }
      } catch (_e) {
        fail++;
      }
    }
  }

  saveBtn.disabled    = false;
  saveBtn.textContent = 'Add';

  if (fail === 0) {
    showToast(`Event applied to ${ok} cell${ok !== 1 ? 's' : ''}`, 'success');
    closeEventModal();
    if (typeof onDone === 'function') onDone();
  } else {
    showToast(`Applied ${ok}, failed ${fail}`, 'error');
    if (ok > 0 && typeof onDone === 'function') onDone();
  }
}

// ── Date list builder ─────────────────────────────────────────────────────────

function buildDateList({ startDate, multi, stopDate, repeats, recurStop }) {
  if (!multi) return [startDate];   // single date mode

  // Build every date from start to stop (inclusive)
  const dates  = [];
  const cursor = new Date(startDate + 'T00:00:00');
  const end    = new Date(stopDate  + 'T00:00:00');
  const recurEnd = (repeats && recurStop) ? new Date(recurStop + 'T00:00:00') : end;

  // Collect selected days-of-week (0=Sun … 6=Sat); empty = all days
  const selectedDOW = repeats
    ? [...document.querySelectorAll('.dow-cb:checked')].map((cb) => parseInt(cb.value, 10))
    : [];

  while (cursor <= end) {
    const dow  = cursor.getDay();
    const keep = !repeats || selectedDOW.length === 0 || (cursor <= recurEnd && selectedDOW.includes(dow));
    if (keep) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up an existing record id for (empId, date) via the API.
 * Used when createAttendance returns 409 and we need to PUT instead.
 */
async function findRecordId(empId, date) {
  try {
    const { getAttendance } = await import('./api.js');
    const res = await getAttendance(date);
    const rec = (res.data || []).find((r) => r.employee_id === empId);
    return rec?.id || null;
  } catch {
    return null;
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
