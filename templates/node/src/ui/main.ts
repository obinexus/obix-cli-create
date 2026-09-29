/**
 * obix-template-node — UI Entry Point
 *
 * Bootstraps the browser-side app: creates a team, wires the runtime
 * to the DOM renderer, and mounts the initial view.
 */

import { createApp } from '../core/index.js';
import { mount, card, statRow, button, badge } from './renderer.js';

declare const document: any;

const app = createApp();

// ── Seed initial team if none exists ──────────────────────────────────────

app.dispatch({
  type: 'CREATE_TEAM',
  payload: {
    name: 'Default Team',
    description: 'Created automatically on first run',
    members: [
      {
        id: 'user-default',
        name: 'You',
        email: 'you@example.com',
        role: 'owner',
        status: 'active',
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
        settings: {},
      },
    ],
    settings: {
      visibility: 'private',
      enableNotifications: true,
      enableReminders: true,
      reminderThresholdHours: 24,
      escalationEnabled: true,
      escalationThresholdHours: 48,
      requireAcknowledgment: false,
      acknowledgmentTimeoutHours: 24,
    },
  },
});

const defaultTeam = Object.values(app.state().teams)[0];

// ── DOM bootstrap ─────────────────────────────────────────────────────────

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found in index.html');

function render(): void {
  root!.innerHTML = '';

  const state = app.state();
  const items = Object.values(state.items).filter((i) => i.teamId === defaultTeam.id);
  const violations = app.validateCompliance();

  // ── Header card ──────────────────────────────────────────────────────
  const { el: headerCard, body: headerBody } = card('OBIX App — ' + defaultTeam.name);
  headerBody.appendChild(statRow('Total items', items.length));
  headerBody.appendChild(
    statRow('Open items', items.filter((i) => i.status === 'open').length)
  );
  headerBody.appendChild(
    statRow('Completed', items.filter((i) => i.status === 'completed').length)
  );
  headerBody.appendChild(
    statRow('Violations', violations.length, violations.length > 0)
  );
  root!.appendChild(headerCard);

  // ── Violations ───────────────────────────────────────────────────────
  if (violations.length > 0) {
    const { el: vCard, body: vBody } = card('#NoGhosting Violations');
    for (const v of violations) {
      const row = document.createElement('div');
      row.className = 'violation-row';
      row.appendChild(badge(v.severity, v.severity === 'critical' ? 'danger' : 'warning'));
      const desc = document.createElement('span');
      desc.textContent = ` ${v.description}`;
      row.appendChild(desc);
      vBody.appendChild(row);
    }
    root!.appendChild(vCard);
  }

  // ── Item list ─────────────────────────────────────────────────────────
  const { el: listCard, body: listBody } = card('Items');

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No items yet. Add one below.';
    listBody.appendChild(empty);
  } else {
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.appendChild(badge(item.priority, item.priority === 'critical' ? 'danger' : 'info'));
      row.appendChild(badge(item.status, item.status === 'completed' ? 'success' : 'info'));
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = ` ${item.title}`;
      row.appendChild(title);

      if (item.status !== 'completed') {
        row.appendChild(
          button('Complete', () => {
            app.dispatch({ type: 'COMPLETE_ITEM', payload: { id: item.id } });
            render();
          }, 'secondary')
        );
      }

      listBody.appendChild(row);
    }
  }

  // ── Add item form ─────────────────────────────────────────────────────
  const form = document.createElement('form');
  form.className = 'add-form';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'New item title…';
  titleInput.className = 'input';
  form.appendChild(titleInput);
  form.appendChild(
    button('Add Item', () => {
      const title = titleInput.value.trim();
      if (!title) return;
      app.dispatch({
        type: 'CREATE_ITEM',
        payload: {
          title,
          description: '',
          assignedTo: ['user-default'],
          createdBy: 'user-default',
          teamId: defaultTeam.id,
          status: 'open',
          priority: 'medium',
          childIds: [],
          tags: [],
          customFields: {},
        },
      });
      render();
    })
  );
  listBody.appendChild(form);
  root!.append