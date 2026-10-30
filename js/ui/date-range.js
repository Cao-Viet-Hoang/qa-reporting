// Date range filter: quick presets + custom from/to. Emits { from, to, preset } ("" = open bound).
import { h } from '../core/dom.js';
import { addDays, todayISO, toISODate, formatDate } from '../core/utils.js';
import { icon } from './icons.js';

export const RANGE_PRESETS = [
  { key: '7d', label: '7 ngày', range: () => ({ from: addDays(todayISO(), -6), to: todayISO() }) },
  { key: '30d', label: '30 ngày', range: () => ({ from: addDays(todayISO(), -29), to: todayISO() }) },
  { key: 'month', label: 'Tháng này', range: () => { const d = new Date(); return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: todayISO() }; } },
  { key: 'all', label: 'Tất cả', range: () => ({ from: '', to: '' }) },
];

export function resolveRange(value) {
  const preset = RANGE_PRESETS.find((p) => p.key === value.preset);
  return preset ? { ...preset.range(), preset: preset.key } : { from: value.from || '', to: value.to || '', preset: 'custom' };
}

export function describeRange({ from, to }) {
  if (!from && !to) return 'Toàn bộ thời gian';
  if (from && to) return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
  return from ? `Từ ${formatDate(from)}` : `Đến ${formatDate(to)}`;
}

export function createDateRange({ value, onChange }) {
  let state = resolveRange(value);
  const fromInput = h('input', { type: 'date', class: 'range__date', 'aria-label': 'Từ ngày', value: state.from, max: state.to || null });
  const toInput = h('input', { type: 'date', class: 'range__date', 'aria-label': 'Đến ngày', value: state.to, min: state.from || null });
  const chips = RANGE_PRESETS.map((p) => h('button', {
    type: 'button', class: 'range__chip', 'data-key': p.key, 'aria-pressed': 'false',
    onClick: () => update({ preset: p.key }),
  }, p.label));
  const customToggle = h('button', { type: 'button', class: 'range__chip range__chip--custom', 'aria-expanded': 'false', onClick: () => {
    custom.hidden = !custom.hidden;
    customToggle.setAttribute('aria-expanded', String(!custom.hidden));
    if (!custom.hidden) fromInput.focus();
  } }, icon('calendar', { size: 14 }), h('span', { class: 'range__custom-label' }, 'Tuỳ chọn'));
  const custom = h('div', { class: 'range__custom', hidden: state.preset !== 'custom' },
    h('label', { class: 'range__field' }, h('span', null, 'Từ'), fromInput),
    h('span', { class: 'range__dash', 'aria-hidden': 'true' }, '→'),
    h('label', { class: 'range__field' }, h('span', null, 'Đến'), toInput),
  );
  const el = h('div', { class: 'range' },
    h('div', { class: 'range__chips', role: 'group', 'aria-label': 'Khoảng ngày' }, chips, customToggle),
    custom,
  );

  const onDate = () => {
    let from = fromInput.value;
    let to = toInput.value;
    if (from && to && from > to) [from, to] = [to, from];
    update({ preset: 'custom', from, to });
  };
  fromInput.addEventListener('change', onDate);
  toInput.addEventListener('change', onDate);

  function paint() {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.key === state.preset)));
    customToggle.classList.toggle('is-active', state.preset === 'custom');
    customToggle.querySelector('.range__custom-label').textContent = state.preset === 'custom' ? describeRange(state) : 'Tuỳ chọn';
    fromInput.value = state.from;
    toInput.value = state.to;
    fromInput.max = state.to || '';
    toInput.min = state.from || '';
  }

  function update(next) {
    state = resolveRange({ ...state, ...next });
    paint();
    onChange(state);
  }

  paint();
  if (state.preset === 'custom') customToggle.setAttribute('aria-expanded', 'true');
  return { el, get: () => state };
}
