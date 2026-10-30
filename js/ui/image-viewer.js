// Full-screen image viewer with swipe/arrow navigation. Images load lazily, one at a time.
import { h, clear } from '../core/dom.js';
import { errorMessage } from '../data/errors.js';
import { imageService } from '../services/image-service.js';
import { icon } from './icons.js';

export function openImageViewer(ids, startIndex = 0, { title = '' } = {}) {
  let index = startIndex;
  let touchX = null;
  const prevFocus = document.activeElement;

  const stage = h('div', { class: 'viewer__stage' });
  const counter = h('span', { class: 'viewer__count num' });
  const prevBtn = h('button', { class: 'viewer__nav viewer__nav--prev', type: 'button', 'aria-label': 'Ảnh trước' }, icon('chevronLeft', { size: 22 }));
  const nextBtn = h('button', { class: 'viewer__nav viewer__nav--next', type: 'button', 'aria-label': 'Ảnh sau' }, icon('chevronRight', { size: 22 }));
  const closeBtn = h('button', { class: 'viewer__close', type: 'button', 'aria-label': 'Đóng' }, icon('x', { size: 20 }));

  const root = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Xem ảnh' },
    h('header', { class: 'viewer__bar' }, h('div', { class: 'viewer__title' }, title, counter), closeBtn),
    stage, prevBtn, nextBtn,
  );

  async function show() {
    counter.textContent = ids.length > 1 ? ` · ${index + 1}/${ids.length}` : '';
    prevBtn.hidden = ids.length < 2;
    nextBtn.hidden = ids.length < 2;
    const id = ids[index];
    clear(stage).append(h('div', { class: 'viewer__loading' }, h('span', { class: 'spinner spinner--light' }), 'Đang tải ảnh…'));
    try {
      const src = await imageService.load(id);
      if (ids[index] !== id) return;
      clear(stage).append(h('img', { class: 'viewer__img', src, alt: `${title} — ảnh ${index + 1}` }));
    } catch (err) {
      if (ids[index] !== id) return;
      clear(stage).append(h('div', { class: 'viewer__loading viewer__loading--error' },
        icon('alert', { size: 22 }), errorMessage(err),
        h('button', { class: 'btn btn--sm btn--on-dark', type: 'button', onClick: show }, 'Thử lại')));
    }
  }

  const go = (delta) => { index = (index + delta + ids.length) % ids.length; show(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 160);
    document.body.classList.remove('no-scroll');
    prevFocus?.focus?.({ preventScroll: true });
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
  }

  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  closeBtn.addEventListener('click', close);
  stage.addEventListener('click', (e) => { if (e.target === stage) close(); });
  stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50 && ids.length > 1) go(dx < 0 ? 1 : -1);
  });
  document.addEventListener('keydown', onKey);

  document.body.append(root);
  document.body.classList.add('no-scroll');
  closeBtn.focus();
  show();
}
