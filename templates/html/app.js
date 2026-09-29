/**
 * obix-template-html — Vanilla JS app
 *
 * Implements the OBIX Heart UX patterns in plain JavaScript:
 *   Controller → Control → Controllee
 *   DOP (Data-Oriented Programming) — state is a plain object
 *   #NoGhosting policy — open items must always have an owner
 *
 * No build step. No framework. Run with:
 *   npx serve .
 */

// ════════════════════════════════════════════════════════════════════════════
// 1. STATE  (the Controller layer — pure data)
// ════════════════════════════════════════════════════════════════════════════

/** @type {Map<string, import('./types').Item>} */
const state = {
  items: {},          // id → Item
  filter: 'all',      // 'all' | 'open' | 'in_progress' | 'completed'
  nextId: 1,
};

// ── Persistence ────────────────────────────────────────────────────────────

function persist() {
  try {
    sessionStorage.setItem('obix-app', JSON.stringify({
      items: state.items,
      nextId: state.nextId,
    }));
  } catch (_) { /* storage not available — continue without persistence */ }
}

function hydrate() {
  try {
    const raw = sessionStorage.getItem('obix-app');
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state.items, saved.items ?? {});
    state.nextId = saved.nextId ?? 1;
  } catch (_) { /* ignore corrupt data */ }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. ACTIONS  (the Control layer — pure transition functions)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create a new item and add it to state.
 * @param {{ title: string, description?: string, priority?: string }} opts
 * @returns {string} new item id
 */
function createItem({ title, description = '', priority = 'medium' }) {
  const id = `item-${state.nextId++}`;
  state.items[id] = {
    id,
    title: title.trim(),
    description: description.trim(),
    priority,
    status:      'open',
    assignedTo:  [],        // #NoGhosting: will flag unassigned open items
    createdAt:   Date.now(),
    updatedAt:   Date.now(),
  };
  persist();
  return id;
}

/**
 * Transition an item's status.
 * @param {string} id
 * @param {'open'|'in_progress'|'completed'|'cancelled'} newStatus
 */
function setItemStatus(id, newStatus) {
  const item = state.items[id];
  if (!item) return;
  item.status    = newStatus;
  item.updatedAt = Date.now();
  if (newStatus === 'completed') item.completedAt = Date.now();
  persist();
}

/**
 * Delete an item from state.
 * @param {string} id
 */
function deleteItem(id) {
  delete state.items[id];
  persist();
}

/**
 * Assign an owner to an item (satisfies #NoGhosting requirement).
 * @param {string} id
 * @param {string} owner
 */
function assignItem(id, owner) {
  const item = state.items[id];
  if (!item) return;
  if (!item.assignedTo.includes(owner)) item.assignedTo.push(owner);
  item.updatedAt = Date.now();
  persist();
}

// ════════════════════════════════════════════════════════════════════════════
// 3. POLICIES  (#NoGhosting compliance — run after every state change)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns an array of violation objects for any policy breach.
 * @returns {{ id: string, severity: 'warning'|'critical', description: string }[]}
 */
function validateCompliance() {
  const violations = [];
  const now = Date.now();

  for (const item of Object.values(state.items)) {
    if (item.status === 'completed' || item.status === 'cancelled') continue;

    // #NoGhosting: every open item needs an owner
    if (item.assignedTo.length === 0) {
      violations.push({
        id:          item.id,
        severity:    item.priority === 'critical' ? 'critical' : 'warning',
        description: `"${item.title}" has no assignee (#NoGhosting)`,
      });
    }

    // Stale open item: no update in 48 hours
    const staleMs = 48 * 60 * 60 * 1000;
    if (item.status === 'open' && now - item.updatedAt > staleMs) {
      violations.push({
        id:          item.id,
        severity:    'warning',
        description: `"${item.title}" has been open for over 48 hours`,
      });
    }
  }

  return violations;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. RENDERER  (the Controllee layer — DOM output)
// ════════════════════════════════════════════════════════════════════════════

// ── Badge helper ───────────────────────────────────────────────────────────

const PRIORITY_BADGE = {
  low:      'muted',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};
const STATUS_BADGE = {
  open:        'info',
  in_progress: 'warning',
  completed:   'success',
  cancelled:   'muted',
};

function badge(text, type) {
  return `<span class="badge badge--${type}">${text}</span>`;
}

// ── Item card ──────────────────────────────────────────────────────────────

function renderItemCard(item) {
  const isDone = item.status === 'completed' || item.status === 'cancelled';

  const actionBtns = isDone
    ? `<button class="btn btn--ghost btn--sm"
                data-action="delete" data-id="${item.id}"
                aria-label="Delete item: ${escHtml(item.title)}">
         Delete
       </button>`
    : `${item.status !== 'in_progress'
        ? `<button class="btn btn--ghost btn--sm"
                    data-action="progress" data-id="${item.id}"
                    aria-label="Start progress on: ${escHtml(item.title)}">
             Start
           </button>` : ''}
       <button class="btn btn--success btn--sm"
               data-action="complete" data-id="${item.id}"
               aria-label="Complete item: ${escHtml(item.title)}">
         Done ✓
       </button>
       <button class="btn btn--danger btn--sm"
               data-action="delete" data-id="${item.id}"
               aria-label="Delete item: ${escHtml(item.title)}">
         ✕
       </button>`;

  return `
    <li class="item-card${isDone ? ' item-card--completed' : ''}"
        data-id="${item.id}"
        role="listitem">
      <div>
        <div class="item-card__meta">
          ${badge(item.priority, PRIORITY_BADGE[item.priority] ?? 'muted')}
          ${badge(item.status.replace('_', ' '), STATUS_BADGE[item.status] ?? 'muted')}
        </div>
        <p class="item-card__title">${escHtml(item.title)}</p>
        ${item.description
          ? `<p class="item-card__desc">${escHtml(item.description)}</p>`
          : ''}
      </div>
      <div class="item-card__actions">${actionBtns}</div>
    </li>`;
}

// ── Main render ────────────────────────────────────────────────────────────

function render() {
  const all       = Object.values(state.items);
  const open      = all.filter(i => i.status === 'open');
  const done      = all.filter(i => i.status === 'completed');
  const violations = validateCompliance();

  // Stats
  document.getElementById('stat-total').textContent      = all.length;
  document.getElementById('stat-open').textContent       = open.length;
  document.getElementById('stat-done').textContent       = done.length;
  document.getElementById('stat-violations').textContent = violations.length;

  const violCard = document.getElementById('stat-violations-card');
  violCard.classList.toggle('stat-card--alert', violations.length > 0);

  // Header badge
  const badge_el = document.getElementById('violation-badge');
  if (violations.length > 0) {
    badge_el.textContent = `${violations.length} violation${violations.length > 1 ? 's' : ''}`;
    badge_el.hidden = false;
  } else {
    badge_el.hidden = true;
  }

  // Violations panel
  const vPanel = document.getElementById('violations-panel');
  const vList  = document.getElementById('violations-list');
  if (violations.length > 0) {
    vPanel.hidden = false;
    vList.innerHTML = violations.map(v =>
      `<li>
        <span class="badge badge--${v.severity === 'critical' ? 'danger' : 'warning'}">
          ${v.severity}
        </span>
        ${escHtml(v.description)}
      </li>`
    ).join('');
  } else {
    vPanel.hidden = true;
    vList.innerHTML = '';
  }

  // Items list
  const list = document.getElementById('items-list');
  const filtered = all.filter(item => {
    if (state.filter === 'all') return true;
    return item.status === state.filter;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<li class="items-list__empty">${
      state.filter === 'all'
        ? 'No items yet — add one above.'
        : `No ${state.filter.replace('_', ' ')} items.`
    }</li>`;
  } else {
    // Sort: open first, then in_progress, completed last
    const ORDER = { open: 0, in_progress: 1, completed: 2, cancelled: 3 };
    const sorted = [...filtered].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    list.innerHTML = sorted.map(renderItemCard).join('');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. EVENT WIRING  (DOM → Actions → render)
// ════════════════════════════════════════════════════════════════════════════

// ── Add form ───────────────────────────────────────────────────────────────

document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form  = e.target;
  const title = form.elements['title'].value.trim();
  const errEl = document.getElementById('add-form-error');

  if (!title) {
    errEl.textContent = 'Title is required.';
    errEl.hidden = false;
    form.elements['title'].setAttribute('aria-invalid', 'true');
    form.elements['title'].focus();
    return;
  }

  errEl.hidden = true;
  form.elements['title'].removeAttribute('aria-invalid');

  createItem({
    title,
    description: form.elements['description'].value,
    priority:    form.elements['priority'].value,
  });

  form.reset();
  form.elements['title'].focus();
  render();
});

// ── Item actions (event delegation) ───────────────────────────────────────

document.getElementById('items-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === 'complete')  setItemStatus(id, 'completed');
  if (action === 'progress')  setItemStatus(id, 'in_progress');
  if (action === 'delete')    deleteItem(id);

  render();
});

// ── Filter toolbar ─────────────────────────────────────────────────────────

document.querySelector('.toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;

  state.filter = btn.dataset.filter;

  // Update aria-pressed on all toolbar buttons
  document.querySelectorAll('.toolbar__btn').forEach(b => {
    const active = b.dataset.filter === state.filter;
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.classList.toggle('toolbar__btn--active', active);
  });

  render();
});

// ════════════════════════════════════════════════════════════════════════════
// 6. UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/** Escape HTML to prevent XSS when inserting user content into innerHTML */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════════════════════════════════════
// 7. BOOT
// ════════════════════════════════════════════════════════════════════════════

hydrate();
render();
