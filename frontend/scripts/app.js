/**
 * app.js
 * Application bootstrap for the month-view attendance tracker.
 * Handles: month navigation, employee CRUD modals, toast notifications.
 * Exports shared utilities used by grid.js.
 */

import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from './api.js';
import { initGrid, loadMonth } from './grid.js';
import { initSpecialEvent } from './specialEvent.js';

// ── Utilities exported to other modules ───────────────────────────────────────

/** YYYY-MM-DD for today */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Format HH:MM (24h) to 12h display */
export function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Toast system ──────────────────────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Modal helpers ──────────────────────────────────────────────────────────────
export function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

export function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── Init grid and load current month ──────────────────────────────────────
  initGrid();
  await loadMonth(year, month);

  // ── Special Event modal ───────────────────────────────────────────────────
  initSpecialEvent(() => loadMonth());

  // ── Add Employee modal ─────────────────────────────────────────────────────
  document.getElementById('addEmployeeBtn').addEventListener('click', () => {
    document.getElementById('empForm').reset();
    document.getElementById('empModalTitle').textContent = 'Add Employee';
    document.getElementById('empSaveBtn').dataset.mode   = 'create';
    delete document.getElementById('empSaveBtn').dataset.pk;
    showModal('empModal');
  });

  document.getElementById('empModalClose').addEventListener('click', () => closeModal('empModal'));
  document.getElementById('empModalCancel').addEventListener('click', () => closeModal('empModal'));

  document.getElementById('empModal').addEventListener('click', (e) => {
    if (e.target.id === 'empModal') closeModal('empModal');
  });

  // Save employee (create or update)
  document.getElementById('empSaveBtn').addEventListener('click', async () => {
    const btn  = document.getElementById('empSaveBtn');
    const mode = btn.dataset.mode;
    const pk   = btn.dataset.pk ? parseInt(btn.dataset.pk, 10) : null;

    const data = {
      name:       document.getElementById('empName').value.trim(),
      department: document.getElementById('empDept').value.trim() || undefined,
    };

    if (!data.name) {
      showToast('Name is required', 'error');
      return;
    }

    try {
      if (mode === 'create') {
        await createEmployee(data);
        showToast('Employee added', 'success');
      } else {
        await updateEmployee(pk, data);
        showToast('Employee updated', 'success');
      }
      closeModal('empModal');
      await loadEmployeesPanel();
      // Reload month grid so new employee appears
      loadMonth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ── Manage Employees panel ─────────────────────────────────────────────────
  document.getElementById('manageEmpBtn').addEventListener('click', async () => {
    await loadEmployeesPanel();
    showModal('empListModal');
  });

  document.getElementById('empListModalClose').addEventListener('click', () => closeModal('empListModal'));
  document.getElementById('empListModal').addEventListener('click', (e) => {
    if (e.target.id === 'empListModal') closeModal('empListModal');
  });

  // Update header date display
  document.getElementById('headerDate').textContent = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
});

// ── Employee list panel ────────────────────────────────────────────────────────
async function loadEmployeesPanel() {
  const container = document.getElementById('empListBody');
  container.innerHTML = '<div style="text-align:center;padding:16px"><span class="spinner"></span></div>';

  try {
    const res = await getEmployees();
    const employees = res.data;

    if (!employees.length) {
      container.innerHTML = '<p style="text-align:center;color:var(--color-muted);padding:16px">No employees yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="month-grid" style="font-size:.82rem;min-width:unset">
        <thead>
          <tr>
            <th>Name</th><th style="width:110px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${employees.map((e) => `
            <tr>
              <td>${escHtml(e.name)}</td>
              <td class="actions-cell">
                <button class="btn btn-secondary btn-sm edit-emp-btn"
                  data-pk="${e.id}"
                  data-name="${escHtml(e.name)}"
                  data-empid="${escHtml(e.employee_id)}"
                  data-shift="${escHtml(e.shift)}"
                  data-email="${escHtml(e.email || '')}"
                  data-dept="${escHtml(e.department || '')}">Edit</button>
                <button class="btn btn-danger btn-sm del-emp-btn"
                  data-pk="${e.id}"
                  data-name="${escHtml(e.name)}">Del</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    container.querySelectorAll('.edit-emp-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEditEmployee(btn.dataset));
    });
    container.querySelectorAll('.del-emp-btn').forEach((btn) => {
      btn.addEventListener('click', () => confirmDeleteEmployee(btn.dataset.pk, btn.dataset.name));
    });
  } catch (err) {
    container.innerHTML = `<p style="color:#dc2626;padding:16px">Error: ${escHtml(err.message)}</p>`;
  }
}

function openEditEmployee(dataset) {
  document.getElementById('empModalTitle').textContent = 'Edit Employee';
  document.getElementById('empSaveBtn').dataset.mode   = 'edit';
  document.getElementById('empSaveBtn').dataset.pk     = dataset.pk;
  document.getElementById('empName').value             = dataset.name;
  document.getElementById('empDept').value             = dataset.dept;
  closeModal('empListModal');
  showModal('empModal');
}

async function confirmDeleteEmployee(pk, name) {
  if (!confirm(`Delete employee "${name}"? This will soft-delete them from the system.`)) return;
  try {
    await deleteEmployee(parseInt(pk, 10));
    showToast('Employee removed', 'success');
    loadEmployeesPanel();
    loadMonth();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
