// Two large Đạt / Không đạt buttons. Tapping the active one again clears the choice (back to null).
import { h } from '../core/dom.js';
import { RESULT } from '../domain/schema.js';
import { icon } from './icons.js';

let seq = 0;

export function createResultToggle({ value, onChange, label, size = 'md' }) {
  const name = `res-${++seq}`;
  let current = value;
  const make = (val, text, iconName) => h('button', {
    type: 'button',
    class: `result__btn result__btn--${val}`,
    role: 'radio',
    'aria-checked': String(current === val),
    'data-value': val,
    onClick: () => set(current === val ? null : val),
  }, icon(iconName, { size: 16 }), h('span', null, text));

  const passBtn = make(RESULT.PASS, 'Đạt', 'check');
  const failBtn = make(RESULT.FAIL, 'Không đạt', 'x');
  const el = h('div', { class: `result result--${size}`, role: 'radiogroup', 'aria-label': label || 'Kết quả', 'data-name': name }, passBtn, failBtn);

  el.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const next = e.target === passBtn ? failBtn : passBtn;
    next.focus();
  });

  function paint() {
    el.dataset.value = current || 'none';
    passBtn.setAttribute('aria-checked', String(current === RESULT.PASS));
    failBtn.setAttribute('aria-checked', String(current === RESULT.FAIL));
  }

  function set(next) {
    current = next;
    paint();
    onChange(next);
  }

  paint();
  return { el, focus: () => passBtn.focus() };
}
