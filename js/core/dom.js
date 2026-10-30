// Minimal hyperscript helper. Strings are always rendered as text nodes (safe by default);
// only trusted markup (icons) goes through the `html` prop.

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate', 'textContent']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'ref' && typeof value === 'function') value(el);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROP_KEYS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  return append(el, children);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Focus an element after the current render flushes. */
export function focusLater(getEl, { select = false } = {}) {
  requestAnimationFrame(() => {
    const el = typeof getEl === 'function' ? getEl() : getEl;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (select && typeof el.select === 'function') el.select();
  });
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Collects disposers so screens can tear down global listeners exactly once. */
export function createDisposer() {
  const fns = [];
  return {
    add(fn) { fns.push(fn); return fn; },
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      fns.push(() => target.removeEventListener(type, handler, options));
    },
    dispose() { while (fns.length) { try { fns.pop()(); } catch (err) { console.error(err); } } },
  };
}
