// Section body renderers for the report form. Each renderer reads from ctrl.form and writes
// changes through ctrl.change(). Inputs are never re-rendered while typing; only structural
// changes (add/remove rows) re-render a single section body, from state, so nothing is lost.
import { h } from '../../core/dom.js';
import { RESULT, createRow } from '../../domain/schema.js';
import { catalogService } from '../../services/catalog-service.js';
import { createCombobox } from '../../ui/combobox.js';
import { createResultToggle } from '../../ui/result-toggle.js';
import { createImageField } from '../../ui/image-field.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { field, textInput, textArea, numberInput, removeButton, addButton, revealNote } from './fields.js';

const issueKey = (section, rowKey, fieldName) => `${section}|${rowKey || ''}|${fieldName}`;

function rowShell(cls, row, ...children) {
  const el = h('div', { class: ['row', cls], 'data-key': row._k || null }, children);
  paintResult(el, row.result);
  return el;
}

function paintResult(el, result) {
  el.classList.toggle('is-fail', result === RESULT.FAIL);
  el.classList.toggle('is-pass', result === RESULT.PASS);
}

/** Removes a row with a short collapse animation and an undo toast. */
function removeRow(ctrl, sectionKey, row, label) {
  const list = ctrl.form[sectionKey];
  const index = list.indexOf(row);
  if (index === -1) return;
  const el = ctrl.sectionBody(sectionKey)?.querySelector(`[data-key="${row._k}"]`);
  const commit = () => {
    list.splice(index, 1);
    ctrl.change({ structural: sectionKey });
  };
  if (el && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.classList.add('is-removing');
    setTimeout(commit, 170);
  } else commit();
  toast(`Đã xoá ${label}`, {
    duration: 5000,
    action: {
      label: 'Hoàn tác',
      onClick: () => {
        const at = Math.min(index, ctrl.form[sectionKey].length);
        ctrl.form[sectionKey].splice(at, 0, row);
        ctrl.change({ structural: sectionKey });
      },
    },
  });
}

function addRow(ctrl, sectionKey, focusSelector) {
  const row = createRow[sectionKey]();
  ctrl.form[sectionKey].push(row);
  ctrl.change({ structural: sectionKey, focus: { rowKey: row._k, selector: focusSelector } });
}

function emptyHint(text) {
  return h('p', { class: 'rows__empty' }, text);
}

/* ---------------- Ý 1 — Incoming materials ---------------- */

function renderIncoming(ctrl) {
  const key = 'incoming';
  const rows = ctrl.form.incoming;
  return h('div', { class: 'rows rows--table rows--incoming' },
    rows.length > 0 && h('div', { class: 'rows__head', 'aria-hidden': 'true' },
      h('span', null, 'Nhà cung cấp'), h('span', null, 'Sản phẩm'), h('span', null, 'Kết quả'), h('span', null, 'Ghi chú'), h('span')),
    rows.length === 0 && emptyHint('Chưa có lô hàng nào được kiểm.'),
    rows.map((row, i) => {
      let rowEl;
      const combo = createCombobox({
        type: 'suppliers',
        label: `Nhà cung cấp dòng ${i + 1}`,
        placeholder: 'Tìm NCC…',
        value: { id: row.supplierId, name: row.supplierName },
        getItems: () => catalogService.active('suppliers'),
        allowCreate: false,
        onChange: (v) => { row.supplierId = v?.id || null; row.supplierName = v?.name || ''; ctrl.change(); },
      });
      ctrl.track(key, combo.destroy);
      const toggle = createResultToggle({
        value: row.result,
        label: `Kết quả dòng ${i + 1}`,
        onChange: (v) => { row.result = v; paintResult(rowEl, v); ctrl.change(); },
      });
      rowEl = rowShell('row--incoming', row,
        h('span', { class: 'row__index num', 'aria-hidden': 'true' }, i + 1),
        field({ label: 'Nhà cung cấp', control: combo.el, issue: issueKey(key, row._k, 'supplier'), cls: 'field--supplier' }),
        field({ label: 'Sản phẩm', control: textInput({ value: row.product, placeholder: 'Tên sản phẩm', onInput: (v) => { row.product = v; ctrl.change(); } }), cls: 'field--product' }),
        h('div', { class: 'field field--result', 'data-issue': issueKey(key, row._k, 'result') },
          h('span', { class: 'field__label' }, 'Kết quả'), toggle.el, h('span', { class: 'field__error', role: 'alert' })),
        field({ label: 'Ghi chú', control: textInput({ value: row.note, placeholder: 'Ghi chú', onInput: (v) => { row.note = v; ctrl.change(); } }), cls: 'field--note' }),
        removeButton({ label: `Xoá dòng ${i + 1}`, onClick: () => removeRow(ctrl, key, row, `dòng ${row.supplierName || i + 1}`) }),
      );
      return rowEl;
    }),
    addButton({ label: 'Thêm dòng', onClick: () => addRow(ctrl, key, '.combo__input') }),
  );
}

/* ---------------- Ý 2, 3 — Hygiene checklists ---------------- */

function renderChecklist(ctrl, key) {
  const rows = ctrl.form[key];
  return h('div', { class: 'checks' }, rows.map((row, i) => {
    let rowEl;
    const detail = h('div', { class: 'check__detail' });
    const noteSlot = h('div', { class: 'check__note' });

    const paintDetail = () => {
      detail.replaceChildren();
      const note = revealNote({
        value: row.note,
        placeholder: row.result === RESULT.FAIL ? 'Mô tả sự không phù hợp…' : 'Ghi chú…',
        onInput: (v) => { row.note = v; ctrl.change(); },
        forceOpen: row.result === RESULT.FAIL,
      });
      noteSlot.replaceChildren(note.el);
      if (row.result === RESULT.FAIL) {
        const images = createImageField({
          ids: row.imageIds,
          reportId: ctrl.reportId,
          title: row.item,
          onChange: (ids) => { row.imageIds = ids; ctrl.change(); },
          onRemove: (id) => ctrl.onImageRemoved(id),
        });
        detail.append(images.el);
      } else if (row.imageIds.length) {
        // Images are kept when the result changes — never silently deleted.
        detail.append(h('p', { class: 'check__kept' }, icon('image', { size: 13 }),
          `${row.imageIds.length} ảnh KPH vẫn được giữ — chọn "Không đạt" để xem hoặc xoá.`));
      }
    };

    const toggle = createResultToggle({
      value: row.result,
      label: `Kết quả ${row.item}`,
      onChange: (v) => {
        const wasFail = row.result === RESULT.FAIL;
        row.result = v;
        paintResult(rowEl, v);
        if (wasFail !== (v === RESULT.FAIL)) paintDetail();
        ctrl.change();
      },
    });

    rowEl = rowShell('check', row,
      h('div', { class: 'check__main' },
        h('span', { class: 'check__name' }, row.item),
        toggle.el,
        noteSlot),
      detail,
    );
    rowEl.dataset.key = `${key}-${i}`;
    paintDetail();
    return rowEl;
  }));
}

/* ---------------- Ý 4 — Storage temperatures ---------------- */

function renderTemperature(ctrl) {
  return h('div', { class: 'temps' }, ctrl.form.temperature.map((row) => {
    const control = numberInput({
      value: row.value,
      placeholder: '—',
      label: `Nhiệt độ ${row.item}`,
      suffix: '°C',
      allowNegative: true,
      onInput: (v) => { row.value = v; ctrl.change(); },
    });
    return h('div', { class: 'temp', 'data-issue': issueKey('temperature', '', `temp-${row.item}`) },
      h('span', { class: 'temp__name' }, icon('thermo', { size: 15 }), row.item),
      control,
      h('span', { class: 'field__error', role: 'alert' }));
  }));
}

/* ---------------- Ý 5 — Retained samples ---------------- */

function renderSamples(ctrl) {
  const key = 'samples';
  const rows = ctrl.form.samples;
  return h('div', { class: 'rows rows--table rows--samples' },
    rows.length > 0 && h('div', { class: 'rows__head', 'aria-hidden': 'true' },
      h('span', null, 'Tên sản phẩm'), h('span', null, 'Lô hàng'), h('span', null, 'Số lượng'), h('span')),
    rows.length === 0 && emptyHint('Chưa có mẫu lưu.'),
    rows.map((row, i) => rowShell('row--samples', row,
      h('span', { class: 'row__index num', 'aria-hidden': 'true' }, i + 1),
      field({ label: 'Tên sản phẩm', control: textInput({ value: row.product, placeholder: 'Tên sản phẩm', onInput: (v) => { row.product = v; ctrl.change(); } }), cls: 'field--product' }),
      field({ label: 'Lô hàng', control: textInput({ value: row.lot, placeholder: 'Số lô', onInput: (v) => { row.lot = v; ctrl.change(); } }) }),
      field({ label: 'Số lượng', control: textInput({ value: row.quantity, placeholder: 'VD: 3 gói', onInput: (v) => { row.quantity = v; ctrl.change(); } }) }),
      removeButton({ label: `Xoá mẫu ${i + 1}`, onClick: () => removeRow(ctrl, key, row, `mẫu ${row.product || i + 1}`) }),
    )),
    addButton({ label: 'Thêm mẫu lưu', onClick: () => addRow(ctrl, key, 'input') }),
  );
}

/* ---------------- Ý 6 — Production line areas ---------------- */

function renderLineAreas(ctrl) {
  const key = 'lineAreas';
  const areas = ctrl.form.lineAreas;
  return h('div', { class: 'areas' },
    areas.length === 0 && emptyHint('Chưa có khu vực nào. Thêm khu vực để kiểm 4 hạng mục: Thao tác, Thông số kỹ thuật, BTP, Thành phẩm.'),
    areas.map((area, ai) => h('div', { class: 'area', 'data-key': area._k },
      h('div', { class: 'area__head' },
        h('div', { class: 'field field--area', 'data-issue': issueKey(key, area._k, 'area') },
          h('label', { class: 'sr-only', for: `area-${area._k}` }, 'Tên khu vực'),
          (() => {
            const input = textInput({ value: area.area, placeholder: `Tên khu vực ${ai + 1}`, onInput: (v) => { area.area = v; ctrl.change(); }, cls: 'input--title' });
            input.id = `area-${area._k}`;
            return input;
          })(),
          h('span', { class: 'field__error', role: 'alert' })),
        removeButton({ label: `Xoá khu vực ${area.area || ai + 1}`, onClick: () => removeRow(ctrl, key, area, `khu vực ${area.area || ai + 1}`) })),
      h('div', { class: 'area__items' }, area.items.map((item) => {
        let rowEl;
        const noteSlot = h('div', { class: 'line-item__note' });
        const paintNote = () => {
          const note = revealNote({
            value: item.note,
            placeholder: 'Mô tả không đạt…',
            label: 'Mô tả',
            forceOpen: item.result === RESULT.FAIL,
            onInput: (v) => { item.note = v; ctrl.change(); },
          });
          noteSlot.replaceChildren(note.el);
        };
        const toggle = createResultToggle({
          value: item.result,
          size: 'sm',
          label: `${item.name} — ${area.area || 'khu vực'}`,
          onChange: (v) => {
            const was = item.result;
            item.result = v;
            paintResult(rowEl, v);
            if ((was === RESULT.FAIL) !== (v === RESULT.FAIL)) paintNote();
            ctrl.change();
          },
        });
        rowEl = rowShell('line-item', item, h('span', { class: 'line-item__name' }, item.name), toggle.el, noteSlot);
        paintNote();
        return rowEl;
      })),
    )),
    addButton({ label: 'Thêm khu vực', onClick: () => addRow(ctrl, key, '.input--title') }),
  );
}

/* ---------------- Ý 7 — Outbound inspection ---------------- */

function renderOutbound(ctrl) {
  const key = 'outbound';
  const rows = ctrl.form.outbound;
  return h('div', { class: 'rows rows--table rows--outbound' },
    rows.length > 0 && h('div', { class: 'rows__head', 'aria-hidden': 'true' },
      h('span', null, 'Sản phẩm'), h('span', null, 'Kết quả'), h('span', null, 'SL không đạt'), h('span', null, 'Ghi chú'), h('span')),
    rows.length === 0 && emptyHint('Chưa kiểm tra xuất kho.'),
    rows.map((row, i) => {
      let rowEl;
      const qtyField = field({
        label: 'SL không đạt',
        control: numberInput({ value: row.failQty, placeholder: '0', label: 'Số lượng không đạt', onInput: (v) => { row.failQty = v; ctrl.change(); } }),
        issue: issueKey(key, row._k, 'failQty'),
        cls: 'field--qty',
      });
      const syncQty = () => qtyField.classList.toggle('is-dim', row.result !== RESULT.FAIL && !String(row.failQty || '').trim());
      const toggle = createResultToggle({
        value: row.result,
        label: `Kết quả dòng ${i + 1}`,
        onChange: (v) => { row.result = v; paintResult(rowEl, v); syncQty(); ctrl.change(); },
      });
      rowEl = rowShell('row--outbound', row,
        h('span', { class: 'row__index num', 'aria-hidden': 'true' }, i + 1),
        field({ label: 'Sản phẩm', control: textInput({ value: row.product, placeholder: 'Tên sản phẩm', onInput: (v) => { row.product = v; ctrl.change(); } }), issue: issueKey(key, row._k, 'product'), cls: 'field--product' }),
        h('div', { class: 'field field--result' }, h('span', { class: 'field__label' }, 'Kết quả'), toggle.el),
        qtyField,
        field({ label: 'Ghi chú', control: textInput({ value: row.note, placeholder: 'Ghi chú', onInput: (v) => { row.note = v; ctrl.change(); } }), cls: 'field--note' }),
        removeButton({ label: `Xoá dòng ${i + 1}`, onClick: () => removeRow(ctrl, key, row, `dòng ${row.product || i + 1}`) }),
      );
      syncQty();
      return rowEl;
    }),
    addButton({ label: 'Thêm sản phẩm', onClick: () => addRow(ctrl, key, 'input') }),
  );
}

/* ---------------- Phần 2 — Nonconformities ---------------- */

function catalogCombo(ctrl, type, row, idKey, nameKey, label, index) {
  const combo = createCombobox({
    type,
    label: `${label} — sự KPH ${index + 1}`,
    placeholder: `Tìm hoặc thêm ${label.toLowerCase()}…`,
    value: { id: row[idKey], name: row[nameKey] },
    getItems: () => catalogService.active(type),
    allowCreate: true,
    onCreate: async (name) => {
      const item = await catalogService.add(type, name);
      toast(`Đã thêm "${item.name}" vào danh mục`, { type: 'success' });
      return item;
    },
    onChange: (v) => { row[idKey] = v?.id || null; row[nameKey] = v?.name || ''; ctrl.change(); },
  });
  ctrl.track('nonconformities', combo.destroy);
  return combo;
}

function renderNonconformities(ctrl) {
  const key = 'nonconformities';
  const rows = ctrl.form.nonconformities;
  return h('div', { class: 'ncs' },
    rows.length === 0 && h('div', { class: 'ncs__empty' },
      h('p', null, 'Chưa ghi nhận sự KPH nào.'),
      h('p', { class: 'ncs__empty-hint' }, 'Các mục "Không đạt" ở Phần 1 không tự động chuyển sang đây — chỉ thêm khi cần kiểm soát sự KPH.')),
    rows.map((row, i) => {
      const cause = catalogCombo(ctrl, 'ncCauses', row, 'causeId', 'causeName', 'Nguyên nhân', i);
      return h('div', { class: 'nc', 'data-key': row._k },
        h('div', { class: 'nc__rail' }, h('span', { class: 'nc__no num' }, `#${i + 1}`)),
        h('div', { class: 'nc__body' },
          field({ label: 'Sự KPH', control: textArea({ value: row.description, placeholder: 'Mô tả sự không phù hợp…', rows: 1, onInput: (v) => { row.description = v; ctrl.change(); } }), issue: issueKey(key, row._k, 'description'), cls: 'field--desc' }),
          h('div', { class: 'nc__grid' },
            field({ label: 'Nguyên nhân', control: cause.el, issue: issueKey(key, row._k, 'cause') }),
            field({ label: 'Số lượng', control: numberInput({ value: row.quantity, placeholder: '0', label: 'Số lượng', onInput: (v) => { row.quantity = v; ctrl.change(); } }), issue: issueKey(key, row._k, 'quantity'), cls: 'field--qty-lg' }),
          ),
        ),
        removeButton({ label: `Xoá sự KPH ${i + 1}`, onClick: () => removeRow(ctrl, key, row, `sự KPH ${i + 1}`) }),
      );
    }),
    addButton({ label: 'Thêm sự KPH', onClick: () => addRow(ctrl, key, 'textarea') }),
  );
}

export const SECTION_RENDERERS = {
  incoming: renderIncoming,
  hygienePersonal: (ctrl) => renderChecklist(ctrl, 'hygienePersonal'),
  hygieneOther: (ctrl) => renderChecklist(ctrl, 'hygieneOther'),
  temperature: renderTemperature,
  samples: renderSamples,
  lineAreas: renderLineAreas,
  outbound: renderOutbound,
  nonconformities: renderNonconformities,
};

export { issueKey };
