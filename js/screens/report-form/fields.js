// Small field builders shared by the report form sections.
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';

let seq = 0;
export const nextId = (prefix = 'f') => `${prefix}-${++seq}`;

/** Labeled field wrapper. `issue` is the validation key used to flag the field. */
export function field({ label, control, issue, cls, hint }) {
  const id = control.id || (control.id = nextId());
  return h('div', { class: ['field', cls], 'data-issue': issue || null },
    h('label', { class: 'field__label', for: id }, label),
    control,
    hint && h('span', { class: 'field__hint' }, hint),
    h('span', { class: 'field__error', role: 'alert' }),
  );
}

export function textInput({ value, placeholder, onInput, inputmode, cls, label, maxlength = 300 }) {
  const input = h('input', {
    class: ['input', cls], type: 'text', value: value ?? '', placeholder: placeholder || '',
    inputmode: inputmode || null, 'aria-label': label || null, maxlength, autocomplete: 'off',
  });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

export function textArea({ value, placeholder, onInput, rows = 2, label }) {
  const ta = h('textarea', { class: 'input input--area', rows, placeholder: placeholder || '', 'aria-label': label || null, maxlength: 1000 });
  ta.value = value ?? '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 220)}px`; };
  ta.addEventListener('input', () => { fit(); onInput(ta.value); });
  requestAnimationFrame(fit);
  return ta;
}

export function numberInput({ value, placeholder, onInput, label, suffix, allowNegative = false }) {
  const input = h('input', {
    class: 'input input--num num', type: 'text', inputmode: 'decimal', value: value ?? '',
    placeholder: placeholder || '', 'aria-label': label || null, autocomplete: 'off', maxlength: 12,
  });
  input.addEventListener('input', () => onInput(input.value));
  if (!suffix && !allowNegative) return input;
  // Mobile decimal keypads often lack "−", so negative-capable inputs get an explicit sign toggle.
  const sign = allowNegative && h('button', {
    class: 'num-field__sign', type: 'button', 'aria-label': 'Đổi dấu âm/dương', title: 'Đổi dấu',
    onClick: () => {
      const v = input.value.trim();
      input.value = v.startsWith('-') ? v.slice(1) : `-${v}`;
      onInput(input.value);
      input.focus();
    },
  }, '±');
  return h('div', { class: 'num-field' }, sign, input, suffix && h('span', { class: 'num-field__suffix' }, suffix));
}

export function removeButton({ label, onClick }) {
  return h('button', { class: 'icon-btn icon-btn--danger row__remove', type: 'button', 'aria-label': label, title: label, onClick }, icon('trash', { size: 16 }));
}

export function addButton({ label, onClick }) {
  return h('button', { class: 'add-row', type: 'button', onClick }, icon('plus', { size: 16 }), h('span', null, label));
}

/** A small pencil button that turns into the note input when tapped (or when a note exists). */
export function revealNote({ value, placeholder = 'Ghi chú…', onInput, forceOpen, label = 'Ghi chú' }) {
  const wrap = h('div', { class: 'note' });
  const openInput = (focus) => {
    const input = textInput({ value, placeholder, onInput, label, cls: 'input--note' });
    wrap.replaceChildren(input);
    wrap.classList.add('is-open');
    if (focus) input.focus();
  };
  if (forceOpen || (value && value.trim())) openInput(false);
  else wrap.append(h('button', { class: 'icon-btn note__toggle', type: 'button', 'aria-label': `Thêm ${label.toLowerCase()}`, title: `Thêm ${label.toLowerCase()}`, onClick: () => openInput(true) }, icon('edit', { size: 16 })));
  return { el: wrap, open: () => openInput(false) };
}
