/**
 * grid.js — Month-view attendance grid.
 *
 * Excel-style copy/paste features:
 *   Select  : Click cell (in Select Mode) • Shift+click range • ⌘/Ctrl+click multi-select
 *             • Click row-header to select whole row • Click col-header to select whole column
 *             • Mouse drag to select a rectangle
 *   Copy    : ⌘C / Ctrl+C  or  toolbar Copy button
 *   Cut     : ⌘X / Ctrl+X  or  toolbar Cut button  (copies then clears source cells on paste)
 *   Paste   : ⌘V / Ctrl+V  or  toolbar Paste button
 *             • Single-cell copied → fills entire target selection with that value
 *             • Multi-cell → tiles the source rectangle over the target
 *             • Buffer stays active after paste — paste again anywhere (Esc to clear)
 *   Delete  : Delete / Backspace key → clears selected cells
 *   Undo    : ⌘Z / Ctrl+Z  (single-level, restores last paste/delete batch)
 *   Esc     : Clears selection and copy buffer, exits Select Mode
 */

import { getMonthView, createAttendance, updateAttendance } from './api.js';
import { showToast } from './app.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUSES = [
  'On Shift 7AM',
  'On Shift 4:30AM',
  'Week Off',
  'Holiday',
  'On Leave',
  'Half Day',
  'Comp Off',
];
const STATUS_ABBR = {
  'On Shift 7AM':    'S7',
  'On Shift 4:30AM': 'S4',
  'Week Off':        'W',
  'Holiday':         'H',
  'On Leave':        'OL',
  'Half Day':        'HD',
  'Comp Off':        'CO',
};

// CSS class suffix per status (no spaces/colons)
const STATUS_CSS = {
  'On Shift 7AM':    'OnShift7AM',
  'On Shift 4:30AM': 'OnShift430AM',
  'Week Off':        'WeekOff',
  'Holiday':         'Holiday',
  'On Leave':        'OnLeave',
  'Half Day':        'HalfDay',
  'Comp Off':        'CompOff',
};

// Mini-badge CSS class suffix
const STATUS_MB = {
  'On Shift 7AM':    'S7',
  'On Shift 4:30AM': 'S4',
  'Week Off':        'W',
  'Holiday':         'H',
  'On Leave':        'OL',
  'Half Day':        'HD',
  'Comp Off':        'CO',
};

const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  year:        new Date().getFullYear(),
  month:       new Date().getMonth() + 1,  // 1-based
  data:        null,   // raw API response
  employees:   [],     // filtered list
  records:     {},     // empId → date → record
  daysInMonth: 0,
};

// Active popover & its source cell
let activePopover = null;
let activeCell    = null;

// ══ Copy/Paste state ══════════════════════════════════════════════════════════
let selectedCells = new Set();          // Set of "empId|YYYY-MM-DD" keys
let anchorCell    = null;               // { empIdx, day } — Shift+click anchor
let selectMode    = false;              // true = clicks select instead of opening popover
let isDragging    = false;              // true during mouse-drag selection
let dragAnchor    = null;               // { empIdx, day } at drag start

// copyBuffer: null | { cells, keys, rows, cols, rowMin, colMin, isCut }
let copyBuffer = null;

// undoStack: array of { targetDate → { empId, old: {status,comments}|null } }
let undoStack  = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
let monthTitle, gridWrapper, statsBar;

export function initGrid() {
  monthTitle  = document.getElementById('monthTitle');
  gridWrapper = document.getElementById('gridWrapper');
  statsBar    = document.getElementById('statsBar');

  // Month navigation
  document.getElementById('prevMonth').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonth').addEventListener('click', () => shiftMonth(+1));

  // Month/year picker input
  document.getElementById('monthPicker').addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    state.year  = y;
    state.month = m;
    loadMonth();
  });

  // Filters
  document.getElementById('searchInput').addEventListener('input',  applyFilters);
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    applyFilters();
  });

  // Export
  document.getElementById('exportCsv').addEventListener('click', exportCSV);

  // Copy/Paste toolbar buttons
  document.getElementById('selectModeBtn').addEventListener('click', cpToggleSelectMode);
  document.getElementById('copyDayBtn').addEventListener('click',  () => cpCopy(false));
  document.getElementById('cutDayBtn').addEventListener('click',   () => cpCopy(true));
  document.getElementById('pasteDayBtn').addEventListener('click', cpPaste);
  document.getElementById('deleteDayBtn').addEventListener('click', cpDelete);
  document.getElementById('cancelCopyBtn').addEventListener('click', cpCancel);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'c')              { e.preventDefault(); cpCopy(false); }
    else if (mod && key === 'x')         { e.preventDefault(); cpCopy(true); }
    else if (mod && key === 'v')         { e.preventDefault(); cpPaste(); }
    else if (mod && key === 'z')         { e.preventDefault(); cpUndo(); }
    else if (mod && key === 'a')         { e.preventDefault(); cpSelectAll(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedCells.size > 0 && !activePopover) { e.preventDefault(); cpDelete(); }
    }
    else if (e.key === 'Escape')         { if (selectMode || copyBuffer || selectedCells.size > 0) cpCancel(); }
  });

  // Close popover when clicking outside both the popover and the source cell
  document.addEventListener('click', (e) => {
    if (
      activePopover &&
      !activePopover.contains(e.target) &&
      e.target !== activeCell &&
      !activeCell?.contains(e.target)
    ) {
      closePopover();
    }
  });
}

// ── Month navigation ──────────────────────────────────────────────────────────
function shiftMonth(delta) {
  state.month += delta;
  if (state.month > 12) { state.month = 1;  state.year++; }
  if (state.month < 1)  { state.month = 12; state.year--; }
  syncPickerInput();
  loadMonth();
}

function syncPickerInput() {
  const picker = document.getElementById('monthPicker');
  if (picker) {
    picker.value = `${state.year}-${String(state.month).padStart(2, '0')}`;
  }
}

// ── Load month data from API ──────────────────────────────────────────────────
export async function loadMonth(year, month) {
  if (year  !== undefined) state.year  = year;
  if (month !== undefined) state.month = month;

  syncPickerInput();
  updateMonthTitle();

  gridWrapper.innerHTML = `
    <div style="text-align:center;padding:48px">
      <span class="spinner"></span>
      <p style="margin-top:12px;color:var(--color-muted)">Loading ${MONTH_NAMES[state.month-1]} ${state.year}…</p>
    </div>`;

  try {
    const res = await getMonthView(state.year, state.month);
    state.data        = res;
    state.daysInMonth = res.daysInMonth;
    state.records     = res.records;
    state.employees   = res.employees;
    // Reset copy state when month changes
    cpCancel();
    applyFilters();
  } catch (err) {
    gridWrapper.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--color-absent-dk)">
        Failed to load data: ${escHtml(err.message)}
      </div>`;
  }
}

function updateMonthTitle() {
  if (monthTitle) {
    monthTitle.textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  }
}

// ── Filtering ─────────────────────────────────────────────────────────────────
function applyFilters() {
  if (!state.data) return;

  const search = (document.getElementById('searchInput').value || '').toLowerCase();

  state.employees = state.data.employees.filter((e) => {
    if (search && !e.name.toLowerCase().includes(search) && !e.employee_id.toLowerCase().includes(search)) return false;
    return true;
  });

  renderGrid();
  renderStats();
}

// ── Render the month grid ─────────────────────────────────────────────────────
function renderGrid() {
  if (!state.data) return;

  const { year, month, daysInMonth, employees, records } = state;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  if (employees.length === 0) {
    gridWrapper.innerHTML = `
      <div class="empty-state">
        <strong>No employees found</strong>
        <p>Try clearing your filters or add employees first.</p>
      </div>`;
    return;
  }

  // Build day column headers
  const dayHeaders = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj   = new Date(year, month - 1, d);
    const dow       = dateObj.getDay();
    const isToday   = d === todayDay;
    const isWeekend = dow === 0 || dow === 6;
    dayHeaders.push({ d, dow, dayName: DAY_NAMES[dow], isToday, isWeekend });
  }

  // Table
  let html = `<table class="month-grid" id="monthGrid">
    <thead>
      <tr class="month-header-row">
        <th class="emp-name-col">Employee</th>
        ${dayHeaders.map(({ d, dayName, isToday, isWeekend }) => {
          return `<th class="day-col${isToday ? ' col-today' : ''}${isWeekend ? ' col-weekend' : ''}" data-day="${d}">
            <div class="day-num">${d}</div>
            <div class="day-name">${dayName}</div>
          </th>`;
        }).join('')}
        <th class="summary-col">Summary</th>
      </tr>
    </thead>
    <tbody>`;

  // Per-day totals: dayTotals[d][status] = count
  const dayTotals = {};
  for (const { d } of dayHeaders) {
    dayTotals[d] = {};
    for (const s of STATUSES) dayTotals[d][s] = 0;
  }

  for (const emp of employees) {
    const empRecords = records[emp.employee_id] || {};
    // Separate counts for each status
    const counts = {};
    for (const s of STATUSES) counts[s] = 0;

    const cells = dayHeaders.map(({ d, isToday, isWeekend }) => {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec     = empRecords[dateStr];
      const status  = rec ? rec.status : null;
      const shift   = rec ? rec.shift  : null;
      if (status && counts[status] !== undefined) counts[status]++;
      if (status && dayTotals[d] && dayTotals[d][status] !== undefined) dayTotals[d][status]++;

      const cssCls   = status ? `cell-${STATUS_CSS[status] || status.replace(/[\s:.]/g, '')}` : 'cell-empty';
      const cellKey  = `${emp.employee_id}|${dateStr}`;
      const isSel    = selectedCells.has(cellKey);
      const isCopied = copyBuffer?.keys.has(cellKey);
      const cls      = [
        'month-cell',
        cssCls,
        isToday   ? 'col-today'   : '',
        isWeekend ? 'col-weekend' : '',
        isSel     ? 'cell-selected' : '',
        isCopied  ? 'cell-copied'   : '',
      ].filter(Boolean).join(' ');

      const statusAbbr = status ? (STATUS_ABBR[status] || status) : '';
      const recId    = rec?.id       || '';
      const comments = rec?.comments || rec?.remarks || '';

      const empIdx = employees.indexOf(emp);
      return `<td class="${cls}"
        data-emp="${escHtml(emp.employee_id)}"
        data-date="${dateStr}"
        data-day="${d}"
        data-empidx="${empIdx}"
        data-recid="${escHtml(String(recId))}"
        data-status="${escHtml(status || '')}"
        data-comments="${escHtml(comments)}"
        title="${escHtml(status || 'Not entered')}">
        <span class="cell-chip">${statusAbbr}</span>
      </td>`;
    }).join('');

    // Build per-row summary mini-badges
    const summaryParts = [];
    for (const s of STATUSES) {
      if (counts[s] > 0) {
        summaryParts.push(
          `<span class="mini-badge mb-${STATUS_MB[s]}">${counts[s]}${STATUS_ABBR[s]}</span>`
        );
      }
    }

    html += `<tr class="emp-row" data-emp="${escHtml(emp.employee_id)}">
      <td class="emp-name-col">${escHtml(emp.name)}</td>
      ${cells}
      <td class="summary-col">${summaryParts.join(' ')}</td>
    </tr>`;
  }

  // ── Column-totals footer row ─────────────────────────────────────────────
  const footCells = dayHeaders.map(({ d, isToday, isWeekend }) => {
    const col = dayTotals[d];
    const badges = STATUSES
      .filter((s) => col[s] > 0)
      .map((s) => `<span class="col-total-badge mb-${STATUS_MB[s]}">${col[s]}${STATUS_ABBR[s]}</span>`)
      .join('<br>');
    const extraCls = (isToday ? ' col-today' : '') + (isWeekend ? ' col-weekend' : '');
    return `<td class="${extraCls}" style="vertical-align:top">${badges || ''}</td>`;
  }).join('');

  html += `</tbody>
  <tfoot>
    <tr class="col-totals-row">
      <td class="emp-name-col">Totals</td>
      ${footCells}
      <td class="summary-col"></td>
    </tr>
  </tfoot>
  </table>`;
  gridWrapper.innerHTML = html;

  // ── Cell click / drag / header-click wiring ──────────────────────────────
  const table = gridWrapper.querySelector('#monthGrid');

  // Mouse-down on a data cell: start drag or set anchor
  gridWrapper.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.month-cell');
    if (!cell) return;
    if (!selectMode && !copyBuffer && !e.shiftKey && !e.metaKey && !e.ctrlKey) return; // normal mode handled by click

    e.preventDefault(); // stop text-selection drag
    isDragging  = true;
    const empIdx = parseInt(cell.dataset.empidx, 10);
    const day    = parseInt(cell.dataset.day, 10);
    dragAnchor   = { empIdx, day };
    anchorCell   = { empIdx, day };
    // Start fresh selection (unless extending)
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) selectedCells.clear();
    cpAddCell(cell.dataset.emp, cell.dataset.date, empIdx, day);
    updateCopyPasteToolbar();
  });

  // Mouse-move: extend drag selection
  gridWrapper.addEventListener('mousemove', (e) => {
    if (!isDragging || !dragAnchor) return;
    const cell = e.target.closest('.month-cell');
    if (!cell) return;
    e.preventDefault();
    const empIdx = parseInt(cell.dataset.empidx, 10);
    const day    = parseInt(cell.dataset.day, 10);
    cpSelectRange(dragAnchor.empIdx, dragAnchor.day, empIdx, day);
    updateCopyPasteToolbar();
  });

  // Mouse-up: end drag
  document.addEventListener('mouseup', () => { isDragging = false; });

  // Click on a data cell
  gridWrapper.querySelectorAll('.month-cell').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const empIdx = parseInt(cell.dataset.empidx, 10);
      const day    = parseInt(cell.dataset.day, 10);

      if (e.shiftKey && anchorCell) {
        cpSelectRange(anchorCell.empIdx, anchorCell.day, empIdx, day);
        updateCopyPasteToolbar();

      } else if (e.metaKey || e.ctrlKey) {
        // ⌘/Ctrl+click: toggle cell (on Mac ctrlKey fires right-click, but metaKey is ⌘)
        cpToggleCell(cell.dataset.emp, cell.dataset.date, empIdx, day);
        updateCopyPasteToolbar();

      } else if (selectMode || copyBuffer) {
        selectedCells.clear();
        cpAddCell(cell.dataset.emp, cell.dataset.date, empIdx, day);
        anchorCell = { empIdx, day };
        updateCopyPasteToolbar();

      } else {
        openPopover(cell);
      }
    });
  });

  // Click on a day-column header → select entire column
  gridWrapper.querySelectorAll('th.day-col').forEach((th) => {
    th.addEventListener('click', (e) => {
      e.stopPropagation();
      const day = parseInt(th.dataset.day, 10);
      const pad = (n) => String(n).padStart(2, '0');
      const date = `${state.year}-${pad(state.month)}-${pad(day)}`;
      if (!e.shiftKey) selectedCells.clear();
      for (let r = 0; r < state.employees.length; r++) {
        const emp = state.employees[r];
        const d   = `${state.year}-${pad(state.month)}-${pad(day)}`;
        selectedCells.add(cellKey(emp.employee_id, d));
        anchorCell = { empIdx: r, day };
      }
      if (!selectMode) { selectMode = true; syncSelectBtn(); }
      repaintCellClasses();
      updateCopyPasteToolbar();
    });
  });

  // Click on an employee name cell → select entire row
  gridWrapper.querySelectorAll('.emp-name-col').forEach((td) => {
    if (td.tagName !== 'TD') return;
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const row  = td.closest('tr');
      const empId = row?.dataset.emp;
      if (!empId) return;
      const empIdx = state.employees.findIndex((em) => em.employee_id === empId);
      if (!e.shiftKey) selectedCells.clear();
      const pad = (n) => String(n).padStart(2, '0');
      for (let d = 1; d <= state.daysInMonth; d++) {
        const date = `${state.year}-${pad(state.month)}-${pad(d)}`;
        selectedCells.add(cellKey(empId, date));
        anchorCell = { empIdx, day: d };
      }
      if (!selectMode) { selectMode = true; syncSelectBtn(); }
      repaintCellClasses();
      updateCopyPasteToolbar();
    });
  });

  updateCopyPasteToolbar();
}

// ── Popover (inline edit) ──────────────────────────────────────────────────────
function openPopover(cell) {
  closePopover(); // close any open one first

  const empId    = cell.dataset.emp;
  const date     = cell.dataset.date;
  const recId    = cell.dataset.recid;
  const status   = cell.dataset.status;
  const comments = cell.dataset.comments;

  const [, , day] = date.split('-');
  const dateObj   = new Date(date + 'T00:00:00');
  const dateLabel = `${DAY_NAMES[dateObj.getDay()]} ${parseInt(day, 10)} ${MONTH_NAMES[state.month - 1]}`;

  // Look up the employee name for a friendlier title
  const emp      = state.data?.employees.find((e) => e.employee_id === empId);
  const empLabel = emp ? emp.name : empId;

  const pop = document.createElement('div');
  pop.className = 'cell-popover';
  pop.innerHTML = `
    <div class="pop-header">
      <div class="pop-title">${escHtml(empLabel)}</div>
      <div class="pop-subtitle">${dateLabel}</div>
      <button class="pop-close" title="Close">×</button>
    </div>
    <div class="pop-body">
      <label class="pop-label">Status *</label>
      <select class="pop-select" id="popStatus">
        <option value="">— select status —</option>
        ${STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>

      <label class="pop-label">Comments</label>
      <input type="text" class="pop-input" id="popComments" value="${escHtml(comments)}" maxlength="200" placeholder="optional" />
    </div>
    <div class="pop-footer">
      <button class="btn btn-secondary btn-sm pop-cancel-btn">Cancel</button>
      <button class="btn btn-primary btn-sm pop-save-btn">Save</button>
    </div>`;

  // ── Mount on <body> so the table never clips it ───────────────────────────
  document.body.appendChild(pop);
  activePopover = pop;
  activeCell    = cell;

  positionPopover(pop, cell);

  // Reposition on scroll/resize so it tracks the cell
  const reposition = () => positionPopover(pop, cell);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });
  pop._cleanup = () => {
    window.removeEventListener('scroll', reposition, { capture: true });
    window.removeEventListener('resize', reposition);
  };

  pop.querySelector('.pop-close').addEventListener('click', (e) => { e.stopPropagation(); closePopover(); });
  pop.querySelector('.pop-cancel-btn').addEventListener('click', (e) => { e.stopPropagation(); closePopover(); });
  pop.querySelector('.pop-save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    saveCell(cell, pop, empId, date, recId);
  });

  // Escape closes; Enter on text inputs saves
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closePopover(); }
    if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      saveCell(cell, pop, empId, date, recId);
    }
  });

  // Focus the status select
  pop.querySelector('#popStatus').focus();
}

/**
 * Position the popover below (or above if near bottom) the clicked cell,
 * using fixed positioning so table overflow/clipping never hides it.
 */
function positionPopover(pop, cell) {
  const rect = cell.getBoundingClientRect();
  const popW = 260;
  const vpW  = window.innerWidth;
  const vpH  = window.innerHeight;
  const popH = pop.offsetHeight || 240; // estimate before paint

  // Horizontal: align with cell, clamp within viewport
  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(8, Math.min(left, vpW - popW - 8));

  // Vertical: prefer below, flip above if not enough room
  let top = rect.bottom + 6;
  if (top + popH > vpH - 8) {
    top = rect.top - popH - 6;
  }
  // Last resort: pin to visible area
  top = Math.max(8, top);

  pop.style.position = 'fixed';
  pop.style.left     = `${left}px`;
  pop.style.top      = `${top}px`;
  pop.style.width    = `${popW}px`;
  pop.style.zIndex   = '9999';
}

function closePopover() {
  if (!activePopover) return;
  if (activePopover._cleanup) activePopover._cleanup();
  activePopover.remove();
  activePopover = null;
  activeCell    = null;
}

async function saveCell(cell, pop, empId, date, recId) {
  const newStatus   = pop.querySelector('#popStatus').value;
  const newComments = pop.querySelector('#popComments').value.trim() || null;

  if (!newStatus) {
    showToast('Select a status', 'error');
    return;
  }

  const saveBtn = pop.querySelector('.pop-save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    let savedId = recId ? parseInt(recId, 10) : null;

    if (savedId) {
      // Update existing record
      await updateAttendance(savedId, {
        status:   newStatus,
        comments: newComments,
      });
    } else {
      // Create new record
      const res = await createAttendance({
        employee_id: empId,
        date,
        status:   newStatus,
        comments: newComments,
      });
      savedId = res.data.id;
    }

    // Update cell DOM in place (no full reload needed)
    const abbr   = STATUS_ABBR[newStatus] || newStatus;
    const cssCls = `cell-${STATUS_CSS[newStatus] || newStatus.replace(/[\s:.]/g, '')}`;

    cell.dataset.status   = newStatus;
    cell.dataset.recid    = savedId;
    cell.dataset.comments = newComments || '';
    cell.title = newStatus;

    // Update cell class
    cell.className = cell.className.replace(/cell-\S+/g, '').trim();
    cell.classList.add(cssCls);
    cell.querySelector('.cell-chip').textContent = abbr;

    // Update per-row summary
    updateRowSummary(cell.closest('tr'));

    // Update in-memory records so filter/stats stay correct
    const empRecords = state.records[empId] || (state.records[empId] = {});
    empRecords[date] = { id: savedId, status: newStatus, comments: newComments };

    closePopover();
    showToast('Saved', 'success');
    renderStats();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
  }
}

/** Re-compute and re-render the per-row summary mini-badges after a cell edit */
function updateRowSummary(tr) {
  if (!tr) return;
  const counts = {};
  for (const s of STATUSES) counts[s] = 0;

  tr.querySelectorAll('.month-cell').forEach((c) => {
    const s = c.dataset.status;
    if (s && counts[s] !== undefined) counts[s]++;
  });

  const summaryCell = tr.querySelector('.summary-col');
  if (!summaryCell) return;
  const parts = [];
  for (const s of STATUSES) {
    if (counts[s] > 0) {
      parts.push(`<span class="mini-badge mb-${STATUS_MB[s]}">${counts[s]}${STATUS_ABBR[s]}</span>`);
    }
  }
  summaryCell.innerHTML = parts.join(' ');
}

// ── Stats bar (totals across whole visible grid) ──────────────────────────────
function renderStats() {
  const counts = {};
  for (const s of STATUSES) counts[s] = 0;
  counts.Empty = 0;

  if (!state.data) return;

  for (const emp of state.employees) {
    const empRecords = state.records[emp.employee_id] || {};
    for (let d = 1; d <= state.daysInMonth; d++) {
      const dateStr = `${state.year}-${String(state.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const rec = empRecords[dateStr];
      if (rec && counts[rec.status] !== undefined) counts[rec.status]++;
      else if (!rec) counts.Empty++;
    }
  }

  const chips = [
    ['On Shift 7AM',    'onshift7am',   counts['On Shift 7AM']],
    ['On Shift 4:30AM', 'onshift430am', counts['On Shift 4:30AM']],
    ['Week Off',        'weekoff',      counts['Week Off']],
    ['Holiday',         'holiday',      counts['Holiday']],
    ['On Leave',        'leave',        counts['On Leave']],
    ['Half Day',        'halfday',      counts['Half Day']],
    ['Comp Off',        'compoff',      counts['Comp Off']],
    ['Not Entered',     'nodata',       counts['Empty']],
  ];

  statsBar.innerHTML = chips
    .map(([label, cls, val]) =>
      `<span class="stat-chip stat-chip-${cls}">${label}: <strong>${val}</strong></span>`
    ).join('');
}

// ── CSV Export ────────────────────────────────────────────────────────────────
export function exportCSV() {
  if (!state.data) { showToast('No data to export', 'error'); return; }

  const { year, month, daysInMonth, employees, records } = state;
  const pad = (n) => String(n).padStart(2, '0');

  // Headers: Employee Name + each date + totals per status
  const headers = [
    'Employee Name',
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
    ...STATUSES,
  ];

  const rows = employees.map((emp) => {
    const empRecords = records[emp.employee_id] || {};
    const counts = {};
    for (const s of STATUSES) counts[s] = 0;

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${year}-${pad(month)}-${pad(i + 1)}`;
      const rec = empRecords[dateStr];
      if (rec && counts[rec.status] !== undefined) counts[rec.status]++;
      return rec ? `${rec.status}${rec.shift ? ' (' + rec.shift + ')' : ''}` : '';
    });

    return [
      emp.name,
      ...dayCells,
      ...STATUSES.map((s) => counts[s]),
    ];
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `attendance-${year}-${pad(month)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded', 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
// COPY / PASTE — full Excel-style
// ══════════════════════════════════════════════════════════════════════════════

const cellKey = (empId, date) => `${empId}|${date}`;

// ── Selection helpers ─────────────────────────────────────────────────────────

function cpAddCell(empId, date, empIdx, day) {
  selectedCells.add(cellKey(empId, date));
  anchorCell = { empIdx, day };
  repaintCellClasses();
}

function cpToggleCell(empId, date, empIdx, day) {
  const key = cellKey(empId, date);
  if (selectedCells.has(key)) selectedCells.delete(key);
  else selectedCells.add(key);
  anchorCell = { empIdx, day };
  repaintCellClasses();
}

function cpSelectRange(r1, c1, r2, c2) {
  selectedCells.clear();
  const rowMin = Math.min(r1,r2), rowMax = Math.max(r1,r2);
  const colMin = Math.min(c1,c2), colMax = Math.max(c1,c2);
  const pad = (n) => String(n).padStart(2,'0');
  for (let r = rowMin; r <= rowMax; r++) {
    const emp = state.employees[r]; if (!emp) continue;
    for (let c = colMin; c <= colMax; c++) {
      selectedCells.add(cellKey(emp.employee_id, `${state.year}-${pad(state.month)}-${pad(c)}`));
    }
  }
  repaintCellClasses();
}

function cpSelectAll() {
  const pad = (n) => String(n).padStart(2,'0');
  selectedCells.clear();
  for (const emp of state.employees) {
    for (let d = 1; d <= state.daysInMonth; d++) {
      selectedCells.add(cellKey(emp.employee_id, `${state.year}-${pad(state.month)}-${pad(d)}`));
    }
  }
  if (!selectMode) { selectMode = true; syncSelectBtn(); }
  repaintCellClasses();
  updateCopyPasteToolbar();
  showToast(`Selected all ${selectedCells.size} cells`, 'info');
}

function repaintCellClasses() {
  const table = document.getElementById('monthGrid');
  if (!table) return;
  table.querySelectorAll('.month-cell').forEach((td) => {
    const key = cellKey(td.dataset.emp, td.dataset.date);
    td.classList.toggle('cell-selected', selectedCells.has(key));
    td.classList.toggle('cell-copied',   !!(copyBuffer?.keys.has(key)));
    td.classList.toggle('cell-cut',      !!(copyBuffer?.isCut && copyBuffer.keys.has(key)));
  });
}

// ── Select Mode toggle ────────────────────────────────────────────────────────

function syncSelectBtn() {
  const btn = document.getElementById('selectModeBtn');
  if (!btn) return;
  if (selectMode) { btn.textContent = '✓ Select ON'; btn.classList.add('btn-select-active'); }
  else            { btn.textContent = 'Select';      btn.classList.remove('btn-select-active'); }
}

function cpToggleSelectMode() {
  selectMode = !selectMode;
  syncSelectBtn();
  if (!selectMode) { cpCancel(); return; }
  selectedCells.clear();
  copyBuffer = null;
  repaintCellClasses();
  updateCopyPasteToolbar();
}

// ── Toolbar state ─────────────────────────────────────────────────────────────

function updateCopyPasteToolbar() {
  const selBtn    = document.getElementById('selectModeBtn');
  const copyBtn   = document.getElementById('copyDayBtn');
  const cutBtn    = document.getElementById('cutDayBtn');
  const pasteBtn  = document.getElementById('pasteDayBtn');
  const deleteBtn = document.getElementById('deleteDayBtn');
  const undoBtn   = document.getElementById('undoDayBtn');
  const cancelBtn = document.getElementById('cancelCopyBtn');
  const copyInfo  = document.getElementById('copyInfo');

  selBtn.style.display = 'inline-flex';

  const hasSel = selectedCells.size > 0;
  const hasBuf = !!copyBuffer;
  const hasUndo = undoStack.length > 0;

  undoBtn.style.display = hasUndo ? 'inline-flex' : 'none';

  if (!selectMode && !hasSel && !hasBuf) {
    [copyBtn, cutBtn, pasteBtn, deleteBtn, cancelBtn].forEach(b => b.style.display = 'none');
    copyInfo.style.display = 'none';
    return;
  }

  // Show action buttons based on state
  copyBtn.style.display   = hasSel                  ? 'inline-flex' : 'none';
  cutBtn.style.display    = hasSel                  ? 'inline-flex' : 'none';
  deleteBtn.style.display = hasSel                  ? 'inline-flex' : 'none';
  pasteBtn.style.display  = (hasBuf && hasSel)      ? 'inline-flex' : 'none';
  cancelBtn.style.display = (hasSel || hasBuf || selectMode) ? 'inline-flex' : 'none';

  // Info text
  if (selectMode && !hasSel && !hasBuf) {
    copyInfo.textContent = 'Select Mode ON — click cells, drag, or click row/column headers';
  } else if (hasBuf && !hasSel) {
    const label = copyBuffer.isCut ? '✂️ Cut' : '📋 Copied';
    copyInfo.textContent = `${label} ${copyBuffer.cells.length} cell${copyBuffer.cells.length !== 1 ? 's' : ''} — select target then ⌘V`;
  } else if (hasBuf && hasSel) {
    const label = copyBuffer.isCut ? '✂️ Cut' : '📋';
    copyInfo.textContent = `${label} ${copyBuffer.cells.length} → paste to ${selectedCells.size} cell${selectedCells.size !== 1 ? 's' : ''} — ⌘V or Paste`;
  } else if (hasSel) {
    copyInfo.textContent = `${selectedCells.size} cell${selectedCells.size !== 1 ? 's' : ''} selected — ⌘C copy · ⌘X cut · Del clear`;
  }
  copyInfo.style.display = 'inline';
}

// ── Copy / Cut ────────────────────────────────────────────────────────────────

function cpCopy(isCut = false) {
  if (selectedCells.size === 0) { showToast('Select cells first', 'error'); return; }

  const cells = [];
  let rowMin = Infinity, rowMax = -Infinity, colMin = Infinity, colMax = -Infinity;

  for (const key of selectedCells) {
    const [empId, date] = key.split('|');
    const day    = parseInt(date.split('-')[2], 10);
    const empIdx = state.employees.findIndex((e) => e.employee_id === empId);
    const rec    = state.records[empId]?.[date];
    cells.push({ empId, date, day, empIdx, status: rec?.status || null, comments: rec?.comments || null });
    rowMin = Math.min(rowMin, empIdx); rowMax = Math.max(rowMax, empIdx);
    colMin = Math.min(colMin, day);    colMax = Math.max(colMax, day);
  }

  copyBuffer = {
    cells, isCut,
    keys:   new Set(selectedCells),
    rowMin, rowMax, colMin, colMax,
    rows:   rowMax - rowMin + 1,
    cols:   colMax - colMin + 1,
  };

  repaintCellClasses();
  updateCopyPasteToolbar();
  showToast(
    isCut
      ? `Cut ${cells.length} cell${cells.length !== 1 ? 's' : ''} — select target then ⌘V`
      : `Copied ${cells.length} cell${cells.length !== 1 ? 's' : ''} — select target then ⌘V`,
    'info'
  );
}

// ── Paste ─────────────────────────────────────────────────────────────────────

async function cpPaste() {
  if (!copyBuffer) { showToast('Nothing copied — ⌘C first', 'error'); return; }
  if (selectedCells.size === 0) { showToast('Select where to paste', 'error'); return; }

  // Target bounding box
  let tRowMin = Infinity, tColMin = Infinity, tRowMax = -Infinity, tColMax = -Infinity;
  for (const key of selectedCells) {
    const [empId, date] = key.split('|');
    const day    = parseInt(date.split('-')[2], 10);
    const empIdx = state.employees.findIndex((e) => e.employee_id === empId);
    tRowMin = Math.min(tRowMin, empIdx); tRowMax = Math.max(tRowMax, empIdx);
    tColMin = Math.min(tColMin, day);    tColMax = Math.max(tColMax, day);
  }

  const pad = (n) => String(n).padStart(2,'0');
  const { year, month, records } = state;

  // srcMap: relative (row,col) → {status, comments}
  const srcMap = {};
  for (const c of copyBuffer.cells) {
    srcMap[`${c.empIdx - copyBuffer.rowMin},${c.day - copyBuffer.colMin}`] = { status: c.status, comments: c.comments };
  }

  const pasteBtn = document.getElementById('pasteDayBtn');
  pasteBtn.disabled = true; pasteBtn.textContent = 'Pasting…';

  let ok = 0, fail = 0;
  const undoBatch = {};   // key → { empId, old }

  try {
    for (let tr = tRowMin; tr <= tRowMax; tr++) {
      const emp = state.employees[tr]; if (!emp) continue;
      for (let tc = tColMin; tc <= tColMax; tc++) {
        if (tc < 1 || tc > state.daysInMonth) continue;

        // Excel behaviour: if source is 1×1, fill whole target; else tile
        const rr = copyBuffer.rows === 1 ? 0 : (tr - tRowMin) % copyBuffer.rows;
        const rc = copyBuffer.cols === 1 ? 0 : (tc - tColMin) % copyBuffer.cols;
        const src = srcMap[`${rr},${rc}`];
        if (!src || !src.status) continue;

        const targetDate  = `${year}-${pad(month)}-${pad(tc)}`;
        const empRecords  = records[emp.employee_id] || (records[emp.employee_id] = {});
        const existingRec = empRecords[targetDate];

        // Snapshot for undo
        undoBatch[`${emp.employee_id}|${targetDate}`] = {
          empId: emp.employee_id, date: targetDate,
          old: existingRec ? { id: existingRec.id, status: existingRec.status, comments: existingRec.comments } : null,
        };

        try {
          let savedId;
          if (existingRec?.id) {
            await updateAttendance(existingRec.id, { status: src.status, comments: src.comments });
            savedId = existingRec.id;
          } else {
            const res = await createAttendance({ employee_id: emp.employee_id, date: targetDate, status: src.status, comments: src.comments });
            savedId = res.data.id;
          }
          empRecords[targetDate] = { id: savedId, status: src.status, comments: src.comments || null };
          ok++;
        } catch (_e) { fail++; }
      }
    }

    // If cut: clear source cells
    if (copyBuffer.isCut && ok > 0) {
      await cpClearCells(copyBuffer.cells, false);
      copyBuffer = null;
    }

    if (Object.keys(undoBatch).length) undoStack.push(undoBatch);

    applyFilters();
    renderStats();
    // Keep buffer alive after paste (like Excel) so user can paste again
    updateCopyPasteToolbar();
    showToast(fail === 0 ? `Pasted ${ok} cell${ok !== 1 ? 's' : ''}` : `Pasted ${ok}, ${fail} failed`, fail === 0 ? 'success' : 'error');
  } finally {
    pasteBtn.disabled = false; pasteBtn.textContent = 'Paste';
  }
}

// ── Delete / Clear ────────────────────────────────────────────────────────────

async function cpDelete() {
  if (selectedCells.size === 0) return;
  const cells = [];
  for (const key of selectedCells) {
    const [empId, date] = key.split('|');
    const rec = state.records[empId]?.[date];
    if (rec?.id) cells.push({ empId, date, id: rec.id, status: rec.status, comments: rec.comments });
  }
  if (cells.length === 0) { showToast('Nothing to clear (cells already empty)', 'info'); return; }
  await cpClearCells(cells, true);
  showToast(`Cleared ${cells.length} cell${cells.length !== 1 ? 's' : ''}`, 'success');
}

async function cpClearCells(cells, pushUndo) {
  const { deleteAttendance } = await import('./api.js');
  const undoBatch = {};
  let ok = 0;
  for (const c of cells) {
    const rec = state.records[c.empId]?.[c.date];
    if (!rec?.id) continue;
    if (pushUndo) undoBatch[`${c.empId}|${c.date}`] = { empId: c.empId, date: c.date, old: { id: rec.id, status: rec.status, comments: rec.comments } };
    try {
      await deleteAttendance(rec.id);
      delete state.records[c.empId][c.date];
      ok++;
    } catch (_e) {}
  }
  if (pushUndo && ok > 0) undoStack.push(undoBatch);
  applyFilters();
  renderStats();
}

// ── Undo ──────────────────────────────────────────────────────────────────────

async function cpUndo() {
  if (undoStack.length === 0) { showToast('Nothing to undo', 'info'); return; }
  const batch = undoStack.pop();
  let ok = 0;
  for (const [, entry] of Object.entries(batch)) {
    const { empId, date, old } = entry;
    const empRecords = state.records[empId] || (state.records[empId] = {});
    const cur = empRecords[date];
    try {
      if (old) {
        // Restore previous value
        if (cur?.id) {
          await updateAttendance(cur.id, { status: old.status, comments: old.comments });
          empRecords[date] = { ...cur, status: old.status, comments: old.comments };
        } else {
          const emp = state.employees.find((e) => e.employee_id === empId);
          if (emp) {
            const res = await createAttendance({ employee_id: empId, date, status: old.status, comments: old.comments });
            empRecords[date] = { id: res.data.id, status: old.status, comments: old.comments };
          }
        }
      } else {
        // Was empty before paste — delete it
        if (cur?.id) {
          const { deleteAttendance } = await import('./api.js');
          await deleteAttendance(cur.id);
          delete empRecords[date];
        }
      }
      ok++;
    } catch (_e) {}
  }
  applyFilters();
  renderStats();
  showToast(`Undo: restored ${ok} cell${ok !== 1 ? 's' : ''}`, 'success');
  updateCopyPasteToolbar();
}

// ── Cancel ────────────────────────────────────────────────────────────────────

function cpCancel() {
  copyBuffer  = null;
  selectMode  = false;
  selectedCells.clear();
  anchorCell  = null;
  isDragging  = false;
  dragAnchor  = null;
  syncSelectBtn();
  repaintCellClasses();
  updateCopyPasteToolbar();
}

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
