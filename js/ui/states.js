// Shared empty / loading / error blocks.
import { h } from '../core/dom.js';
import { icon } from './icons.js';

export function emptyState({ icon: iconName = 'info', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__glyph' }, icon(iconName, { size: 22 })),
    h('p', { class: 'empty__title' }, title),
    text && h('p', { class: 'empty__text' }, text),
    action,
  );
}

export function errorState({ message, onRetry }) {
  return h('div', { class: 'empty empty--error', role: 'alert' },
    h('div', { class: 'empty__glyph' }, icon('alert', { size: 22 })),
    h('p', { class: 'empty__title' }, 'Không tải được dữ liệu'),
    h('p', { class: 'empty__text' }, message),
    onRetry && h('button', { class: 'btn btn--soft', type: 'button', onClick: onRetry }, icon('refresh', { size: 16 }), 'Thử lại'),
  );
}

export function skeletonRows(count = 4, cls = '') {
  return h('div', { class: `skeleton ${cls}`, 'aria-busy': 'true', 'aria-label': 'Đang tải' },
    Array.from({ length: count }, (_, i) => h('div', { class: 'skeleton__row', style: { animationDelay: `${i * 80}ms` } },
      h('span', { class: 'skeleton__block skeleton__block--a' }),
      h('span', { class: 'skeleton__lines' }, h('span', { class: 'skeleton__line' }), h('span', { class: 'skeleton__line skeleton__line--short' })),
    )));
}
