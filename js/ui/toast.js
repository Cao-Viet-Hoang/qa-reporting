import { h } from '../core/dom.js';
import { icon } from './icons.js';

const ICONS = { success: 'check', error: 'alert', info: 'info', warn: 'alert' };

/** Non-blocking feedback. Errors stay longer; an optional action button (e.g. "Thử lại"). */
export function toast(message, { type = 'info', duration, action } = {}) {
  const root = document.getElementById('toasts');
  if (!root) return () => {};
  const ttl = duration ?? (type === 'error' ? 7000 : 3200);
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  const el = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(ICONS[type], { size: 16, cls: 'toast__icon' }),
    h('span', { class: 'toast__msg' }, message),
    action && h('button', { class: 'toast__action', type: 'button', onClick: () => { close(); action.onClick(); } }, action.label),
    h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Đóng thông báo', onClick: close }, icon('x', { size: 14 })),
  );
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  if (ttl > 0) timer = setTimeout(close, ttl);
  return close;
}
