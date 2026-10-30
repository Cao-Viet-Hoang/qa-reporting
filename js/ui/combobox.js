// Searchable catalog picker (ARIA combobox). Suggestions render inline *below* the input and push
// content down instead of floating over it, so nothing being typed is ever covered.
import { h, clear } from '../core/dom.js';
import { normalizeText, cleanName } from '../core/utils.js';
import { appState } from '../core/store.js';
import { icon } from './icons.js';

let seq = 0;
const MAX_RESULTS = 8;

/**
 * createCombobox({
 *   type, value: { id, name }, placeholder, label,
 *   allowCreate: boolean, onCreate: async (name) => item,
 *   onChange: ({ id, name } | null) => void,
 *   getItems: () => items (active catalog items)
 * })
 */
export function createCombobox(opts) {
  const id = `cb-${++seq}`;
  let selected = opts.value?.id ? { id: opts.value.id, name: opts.value.name } : null;
  let open = false;
  let activeIndex = -1;
  let options = [];
  let creating = false;

  const input = h('input', {
    class: 'combo__input',
    type: 'text',
    id: `${id}-input`,
    role: 'combobox',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
    'aria-label': opts.label,
    placeholder: opts.placeholder || 'Gõ để tìm…',
    value: selected?.name || '',
  });
  const clearBtn = h('button', { class: 'combo__clear', type: 'button', 'aria-label': 'Bỏ chọn', tabindex: '-1' }, icon('x', { size: 14 }));
  const list = h('ul', { class: 'combo__list', id: `${id}-list`, role: 'listbox', 'aria-label': opts.label });
  const root = h('div', { class: 'combo' },
    h('div', { class: 'combo__field' }, icon('search', { size: 16, cls: 'combo__icon' }), input, clearBtn),
    list,
  );

  const sync = () => {
    root.classList.toggle('is-open', open);
    root.classList.toggle('has-value', Boolean(selected));
    input.setAttribute('aria-expanded', String(open));
    const hiddenSnapshot = selected && !opts.getItems().some((x) => x.id === selected.id);
    root.classList.toggle('is-historic', Boolean(hiddenSnapshot));
    root.title = hiddenSnapshot ? 'Mục này đã bị ẩn hoặc đổi tên trong danh mục — báo cáo giữ tên tại thời điểm nhập.' : '';
  };

  function compute() {
    const q = normalizeText(input.value);
    const items = opts.getItems();
    const scored = [];
    for (const item of items) {
      const n = normalizeText(item.name);
      if (!q) { scored.push({ item, score: 2 }); continue; }
      const idx = n.indexOf(q);
      if (idx === -1) {
        const words = q.split(' ');
        if (words.every((w) => n.includes(w))) scored.push({ item, score: 3 });
        continue;
      }
      scored.push({ item, score: idx === 0 ? 0 : (n[idx - 1] === ' ' ? 1 : 2) });
    }
    scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'vi'));
    const results = scored.slice(0, MAX_RESULTS).map((s) => ({ kind: 'item', item: s.item }));
    const typed = cleanName(input.value);
    const exact = items.some((x) => normalizeText(x.name) === normalizeText(typed));
    if (opts.allowCreate && typed && !exact) results.push({ kind: 'create', name: typed });
    return { results, total: scored.length };
  }

  function render() {
    clear(list);
    const status = appState.get().catalogStatus;
    const { results, total } = compute();
    options = results;
    if (status === 'loading' && opts.getItems().length === 0) {
      list.append(h('li', { class: 'combo__note' }, h('span', { class: 'spinner spinner--sm' }), 'Đang tải danh mục…'));
    } else if (!results.length) {
      list.append(h('li', { class: 'combo__note' }, input.value ? 'Không tìm thấy trong danh mục.' : 'Danh mục đang trống.'));
    }
    results.forEach((opt, i) => {
      const optionId = `${id}-opt-${i}`;
      const li = opt.kind === 'item'
        ? h('li', { class: ['combo__opt', selected?.id === opt.item.id && 'is-selected'], id: optionId, role: 'option', 'aria-selected': String(i === activeIndex) },
            highlight(opt.item.name, input.value),
            selected?.id === opt.item.id && icon('check', { size: 14, cls: 'combo__tick' }))
        : h('li', { class: 'combo__opt combo__opt--create', id: optionId, role: 'option', 'aria-selected': String(i === activeIndex) },
            icon('plus', { size: 14 }),
            h('span', null, 'Thêm ', h('strong', null, `"${opt.name}"`), ' vào danh mục'),
            creating && h('span', { class: 'spinner spinner--sm' }));
      li.classList.toggle('is-active', i === activeIndex);
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in input
      li.addEventListener('click', () => choose(i));
      list.append(li);
    });
    if (total > MAX_RESULTS) list.append(h('li', { class: 'combo__note combo__note--more' }, `+${total - MAX_RESULTS} mục khác — gõ thêm để lọc`));
    input.setAttribute('aria-activedescendant', activeIndex >= 0 ? `${id}-opt-${activeIndex}` : '');
  }

  function setOpen(next) {
    open = next;
    if (open) { activeIndex = input.value && options.length ? 0 : -1; render(); }
    sync();
  }

  async function choose(index) {
    const opt = options[index];
    if (!opt || creating) return;
    if (opt.kind === 'item') {
      commit({ id: opt.item.id, name: opt.item.name });
      return;
    }
    creating = true;
    render();
    try {
      const item = await opts.onCreate(opt.name);
      commit({ id: item.id, name: item.name });
    } catch (err) {
      list.prepend(h('li', { class: 'combo__note combo__note--error', role: 'alert' }, err?.message || 'Không thêm được.'));
    } finally {
      creating = false;
      if (open) render();
    }
  }

  function commit(value) {
    selected = value;
    input.value = value?.name || '';
    opts.onChange(value);
    setOpen(false);
    sync();
  }

  input.addEventListener('focus', () => { input.select(); setOpen(true); });
  input.addEventListener('input', () => { activeIndex = 0; open = true; render(); sync(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); activeIndex = Math.min(options.length - 1, activeIndex + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); render(); }
    else if (e.key === 'Enter') { if (open && activeIndex >= 0) { e.preventDefault(); choose(activeIndex); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); input.value = selected?.name || ''; setOpen(false); } }
    else if (e.key === 'Tab' && open) { setOpen(false); }
  });
  input.addEventListener('blur', () => {
    // Typed text without a choice never silently becomes a value: revert to the current selection.
    if (creating) return;
    if (!cleanName(input.value) && selected) commit(null);
    else input.value = selected?.name || '';
    setOpen(false);
  });
  clearBtn.addEventListener('click', () => { commit(null); input.focus(); });

  const unsubscribe = appState.subscribe(() => { if (open) render(); sync(); });
  sync();

  return {
    el: root,
    input,
    focus: () => input.focus(),
    destroy: unsubscribe,
  };
}

function highlight(name, query) {
  const q = normalizeText(query);
  if (!q) return h('span', null, name);
  const n = normalizeText(name);
  const idx = n.indexOf(q);
  // normalizeText keeps 1:1 char length for Vietnamese letters, so indexes map back to the original.
  if (idx === -1 || n.length !== name.length) return h('span', null, name);
  return h('span', null, name.slice(0, idx), h('mark', null, name.slice(idx, idx + q.length)), name.slice(idx + q.length));
}
