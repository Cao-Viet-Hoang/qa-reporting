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

export function textArea({ value, placeholder, onInput, rows = 2, label, cls, maxlength = 1000 }) {
  const ta = h('textarea', { class: ['input input--area', cls], rows, placeholder: placeholder || '', 'aria-label': label || null, maxlength });
  ta.value = value ?? '';
  const fit = () => {
    ta.style.height = 'auto';
    // Not laid out yet (detached / display:none): keep the natural rows height.
    if (ta.scrollHeight) ta.style.height = `${Math.min(ta.scrollHeight + 2, 220)}px`;
  };
  ta.addEventListener('input', () => { fit(); onInput(ta.value); });
  requestAnimationFrame(fit);
  return ta;
}

/** Auto-growing note box: long text wraps onto new lines instead of scrolling sideways. */
export function noteInput({ value, placeholder = 'Ghi chú…', onInput, label = 'Ghi chú' }) {
  return textArea({ value, placeholder, onInput, label, rows: 1, cls: 'input--note', maxlength: 500 });
}

export function numberInput({ value, placeholder, onInput, label, suffix }) {
  const input = h('input', {
    class: 'input input--num num', type: 'text', inputmode: 'decimal', value: value ?? '',
    placeholder: placeholder || '', 'aria-label': label || null, autocomplete: 'off', maxlength: 12,
  });
  input.addEventListener('input', () => onInput(input.value));
  if (!suffix) return input;
  return h('div', { class: 'num-field' }, input, h('span', { class: 'num-field__suffix' }, suffix));
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
    const input = noteInput({ value, placeholder, onInput, label });
    wrap.replaceChildren(input);
    wrap.classList.add('is-open');
    if (focus) input.focus();
  };
  if (forceOpen || (value && value.trim())) openInput(false);
  else wrap.append(h('button', { class: 'icon-btn note__toggle', type: 'button', 'aria-label': `Thêm ${label.toLowerCase()}`, title: `Thêm ${label.toLowerCase()}`, onClick: () => openInput(true) }, icon('edit', { size: 16 })));
  return { el: wrap, open: () => openInput(false) };
}
