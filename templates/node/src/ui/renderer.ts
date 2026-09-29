/// <reference lib="dom" />

/**
 * obix-template-node — Minimal DOM Renderer
 *
 * No virtual DOM. Descriptors → real elements, mounted into a container.
 * Subscribe your runtime to `mount()` for reactive re-renders.
 */

export interface ObixNode {
  tag: string;
  attrs?: Record<string, string>;
  className?: string;
  text?: string;
  children?: ObixNode[];
}

/** Build a real DOM element from an ObixNode descriptor tree. */
export function createElement(node: ObixNode): HTMLElement {
  const el = document.createElement(node.tag);

  if (node.className) el.className = node.className;

  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) el.setAttribute(k, v);
  }

  if (node.text !== undefined) el.textContent = node.text;

  if (node.children) {
    for (const child of node.children) el.appendChild(createElement(child));
  }

  return el;
}

/**
 * Mount a render function into a container element.
 * Returns an `update` function you can call whenever state changes.
 *
 * @example
 * const update = mount(document.getElementById('app')!, () => ({
 *   tag: 'p', text: `Count: ${state.count}`
 * }));
 * runtime.subscribe(() => update());
 */
export function mount(container: HTMLElement, render: () => ObixNode): () => void {
  function update(): void {
    container.innerHTML = '';
    container.appendChild(createElement(render()));
  }
  update();
  return update;
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

export function card(title: string): { el: HTMLElement; body: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'card';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  el.appendChild(h2);
  const body = document.createElement('div');
  body.className = 'card-body';
  el.appendChild(body);
  return { el, body };
}

export function badge(
  text: string,
  type: 'success' | 'warning' | 'danger' | 'info'
): HTMLElement {
  const el = document.createElement('span');
  el.className = `badge badge-${type}`;
  el.textContent = text;
  return el;
}

export function statRow(label: string, value: string | number, danger = false): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stat';
  const lEl = document.createElement('span');
  lEl.className = 'stat-label';
  lEl.textContent = label;
  const vEl = document.createElement('span');
  vEl.className = 'stat-value';
  vEl.textContent = String(value);
  if (danger) vEl.style.color = 'var(--color-danger, #e74c3c)';
  row.appendChild(lEl);
  row.appendChild(vEl);
  return row;
}

export function button(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' | 'danger' = 'primary'
): HTMLElement {
  const el = document.createElement('button');
  el.className = `button button-${variant}`;
  el.textContent = label;
  el.setAttribute('type', 'button');
  el.addEventListener('click', onClick);
  return el;
}

export function input(
  placeholder: string,
  onInput: (value: string) => void,
  type = 'text'
): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  el.placeholder = placeholder;
  el.className = 'input';
  el.addEventListener('input', () => onInput(el.value));
  return el;
}
