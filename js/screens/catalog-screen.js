// Catalog management: segmented tabs (Nhà cung cấp / Nguyên nhân KPH / Hình thức xử lý).
// A single "add / filter" bar on top, items as a quiet list with inline rename, and hidden items
// tucked into a collapsible group at the bottom (soft delete — history is never altered).
import { h, clear, createDisposer, focusLater } from '../core/dom.js';
import { appState } from '../core/store.js';
import { STORAGE_KEYS } from '../config/app-config.js';
import { normalizeText, cleanName } from '../core/utils.js';
import { storage } from '../local/storage.js';
import { CATALOG_TYPES } from '../domain/schema.js';
import { catalogService } from '../services/catalog-service.js';
import { icon } from '../ui/icons.js';
import { emptyState, errorState, skeletonRows } from '../ui/states.js';
import { toast } from '../ui/toast.js';

const TYPES = Object.values(CATALOG_TYPES);

export function mountCatalog(container) {
  const disposer = createDisposer();
  const ui = storage.get(STORAGE_KEYS.ui, {}) || {};
  let type = TYPES.some((t) => t.key === ui.catalogTab) ? ui.catalogTab : 'suppliers';
  let query = '';
  let editingId = null;
  let showHidden = false;
  let adding = false;
  const busyIds = new Set();

  const tabs = TYPES.map((t) => h('button', {
    class: 'seg__btn', type: 'button', role: 'tab', 'data-key': t.key, 'aria-selected': 'false',
    onClick: () => switchTab(t.key),
  }, h('span', null, t.label), h('span', { class: 'seg__count num' })));

  const input = h('input', { class: 'catbar__input', type: 'text', autocomplete: 'off', maxlength: 120, 'aria-label': 'Tìm hoặc thêm mục' });
  const addBtn = h('button', { class: 'btn btn--primary catbar__add', type: 'submit' }, icon('plus', { size: 16 }), h('span', { class: 'btn__label' }, 'Thêm'));
  const bar = h('form', { class: 'catbar', novalidate: true }, icon('search', { size: 16, cls: 'catbar__icon' }), input, addBtn);
  const listEl = h('div', { class: 'catlist', role: 'tabpanel' });

  container.append(h('div', { class: 'page page--catalog' },
    h('header', { class: 'page__head' }, h('div', null,
      h('h1', { class: 'page__title' }, 'Danh mục'),
      h('p', { class: 'page__meta' }, 'Đổi tên hoặc ẩn không làm thay đổi các báo cáo đã lưu.'))),
    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Loại danh mục' }, tabs),
    bar,
    listEl,
  ));

  function switchTab(key) {
    type = key;
    query = '';
    input.value = '';
    editingId = null;
    showHidden = false;
    try { storage.set(STORAGE_KEYS.ui, { ...(storage.get(STORAGE_KEYS.ui, {}) || {}), catalogTab: key }); } catch { /* optional */ }
    render();
  }

  function filtered(items) {
    const q = normalizeText(query);
    return q ? items.filter((x) => normalizeText(x.name).includes(q)) : items;
  }

  async function runBusy(id, fn) {
    busyIds.add(id);
    render();
    try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } finally { busyIds.delete(id); render(); }
  }

  function itemRow(item) {
    const busy = busyIds.has(item.id);
    if (editingId === item.id) {
      const edit = h('input', { class: 'input catitem__edit', type: 'text', value: item.name, maxlength: 120, 'aria-label': `Đổi tên ${item.name}` });
      const commit = async () => {
        const name = cleanName(edit.value);
        editingId = null;
        if (!name || name === item.name) { render(); return; }
        await runBusy(item.id, async () => { await catalogService.rename(type, item.id, name); toast('Đã đổi tên', { type: 'success' }); });
      };
      edit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { editingId = null; render(); }
      });
      focusLater(edit, { select: true });
      return h('li', { class: 'catitem is-editing' },
        edit,
        h('div', { class: 'catitem__actions' },
          h('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: commit }, 'Lưu'),
          h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => { editingId = null; render(); } }, 'Huỷ')));
    }
    return h('li', { class: ['catitem', !item.active && 'is-hidden', busy && 'is-busy'] },
      h('span', { class: 'catitem__name' }, item.name),
      !item.active && h('span', { class: 'catitem__tag' }, icon('eyeOff', { size: 12 }), 'Đã ẩn'),
      busy && h('span', { class: 'spinner spinner--sm' }),
      h('div', { class: 'catitem__actions' },
        item.active && h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Đổi tên ${item.name}`, title: 'Đổi tên', disabled: busy, onClick: () => { editingId = item.id; render(); } }, icon('edit', { size: 16 })),
        item.active
          ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Ẩn ${item.name}`, title: 'Ẩn khỏi lựa chọn', disabled: busy,
              onClick: () => runBusy(item.id, async () => {
                await catalogService.setActive(type, item.id, false);
                toast(`Đã ẩn "${item.name}"`, { action: { label: 'Hoàn tác', onClick: () => runBusy(item.id, () => catalogService.setActive(type, item.id, true)) } });
              }) }, icon('eyeOff', { size: 16 }))
          : h('button', { class: 'btn btn--sm btn--soft', type: 'button', disabled: busy,
              onClick: () => runBusy(item.id, async () => { await catalogService.setActive(type, item.id, true); toast(`Đã hiện lại "${item.name}"`, { type: 'success' }); }) },
              icon('restore', { size: 14 }), 'Hiện lại')));
  }

  function render() {
    const state = appState.get();
    const meta = CATALOG_TYPES[type];
    tabs.forEach((t) => {
      const on = t.dataset.key === type;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.querySelector('.seg__count').textContent = String(catalogService.active(t.dataset.key).length || '');
    });
    input.placeholder = `Tìm hoặc thêm ${meta.singular}…`;

    const all = catalogService.all(type);
    const typed = cleanName(query);
    const exact = typed && catalogService.findByName(type, typed);
    addBtn.disabled = !typed || adding || Boolean(exact && exact.active);
    addBtn.classList.toggle('is-loading', adding);
    addBtn.querySelector('.btn__label').textContent = exact && !exact.active ? 'Hiện lại' : 'Thêm';

    clear(listEl);
    if (state.catalogStatus === 'loading' && all.length === 0) { listEl.append(skeletonRows(6)); return; }
    if (state.catalogStatus === 'error' && all.length === 0) {
      listEl.append(errorState({ message: state.catalogError, onRetry: () => catalogService.load({ force: true }).catch(() => {}) }));
      return;
    }
    const active = filtered(all.filter((x) => x.active));
    const hidden = filtered(all.filter((x) => !x.active));

    if (!all.length) {
      listEl.append(emptyState({
        icon: 'catalog',
        title: `Chưa có ${meta.singular} nào`,
        text: type === 'suppliers' ? 'Gõ tên vào ô phía trên để thêm.' : 'Gõ tên vào ô phía trên để thêm — hoặc thêm trực tiếp khi nhập Phần 2 của báo cáo.',
      }));
      return;
    }
    if (typed && !active.length && !hidden.length) {
      listEl.append(h('p', { class: 'catlist__none' }, 'Không có mục khớp. Nhấn ', h('strong', null, 'Thêm'), ` để tạo "${typed}".`));
    }
    if (active.length) listEl.append(h('ul', { class: 'catlist__items' }, active.map(itemRow)));

    if (hidden.length) {
      const expanded = showHidden || Boolean(typed);
      listEl.append(h('div', { class: 'catlist__hidden' },
        h('button', { class: 'catlist__hidden-toggle', type: 'button', 'aria-expanded': String(expanded), onClick: () => { showHidden = !showHidden; render(); } },
          icon(expanded ? 'chevronDown' : 'chevronRight', { size: 15 }), `Đã ẩn (${hidden.length})`,
          h('span', { class: 'catlist__hidden-hint' }, 'không hiện khi chọn trong báo cáo')),
        expanded && h('ul', { class: 'catlist__items' }, hidden.map(itemRow))));
    }
  }

  input.addEventListener('input', () => { query = input.value; render(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; query = ''; render(); } });
  bar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = cleanName(input.value);
    if (!typed || adding) return;
    adding = true;
    render();
    try {
      const item = await catalogService.add(type, typed);
      toast(`Đã thêm "${item.name}"`, { type: 'success' });
      input.value = '';
      query = '';
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      adding = false;
      render();
      input.focus();
    }
  });

  // Arrow keys move between tabs (ARIA tabs pattern).
  disposer.listen(container, 'keydown', (e) => {
    if (!e.target.classList?.contains('seg__btn') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = TYPES.findIndex((t) => t.key === type);
    const next = TYPES[(i + (e.key === 'ArrowRight' ? 1 : -1) + TYPES.length) % TYPES.length];
    switchTab(next.key);
    tabs.find((t) => t.dataset.key === next.key)?.focus();
  });
  disposer.add(appState.subscribe(render));
  render();

  return { unmount: () => disposer.dispose() };
}
