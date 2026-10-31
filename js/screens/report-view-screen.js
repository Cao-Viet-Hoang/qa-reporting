// Read-only report view: every section laid out in full, no inputs, nothing collapsed — for people
// who only want to read a report quickly. Editing lives on its own route (#/report/<id>/edit).
import { h, clear } from '../core/dom.js';
import { router } from '../core/router.js';
import { formatDateLong, formatDateTime, formatNumber, isBlank } from '../core/utils.js';
import { drafts } from '../local/drafts.js';
import { errorMessage } from '../data/errors.js';
import { SECTIONS, SECTION_BY_KEY, STATUS_LABEL, RESULT_LABEL, DISPOSITION, DISPOSITION_LABEL } from '../domain/schema.js';
import { summarizeReport } from '../domain/report-summary.js';
import { reportService } from '../services/report-service.js';
import { icon } from '../ui/icons.js';
import { openImageViewer } from '../ui/image-viewer.js';
import { errorState } from '../ui/states.js';

const text = (v) => (isBlank(v) ? '—' : String(v));

function resultBadge(result) {
  if (!RESULT_LABEL[result]) return h('span', { class: 'res res--none' }, '—');
  return h('span', { class: `res res--${result}` }, RESULT_LABEL[result]);
}

/** Table that turns into labeled cards on phones (labels come from data-label). */
function table(cls, columns, rows, rowClass) {
  return h('table', { class: ['vtable', cls] },
    h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', class: c.cls || null }, c.label)))),
    h('tbody', null, rows.map((row, i) => h('tr', { class: rowClass?.(row) || null },
      columns.map((c) => h('td', { class: c.cls || null, 'data-label': c.label }, c.render(row, i)))))));
}

const nothing = (msg = 'Không có dữ liệu') => h('p', { class: 'vsec__empty' }, msg);
const failRow = (r) => (r.result === 'fail' ? 'is-fail' : null);

/* ---------------- Section bodies ---------------- */

function incoming(report) {
  const rows = report.incoming || [];
  if (!rows.length) return nothing();
  return table('vtable--incoming', [
    { label: '#', cls: 'vtable__idx num', render: (_, i) => i + 1 },
    { label: 'Nhà cung cấp', render: (r) => text(r.supplierName) },
    { label: 'Sản phẩm', render: (r) => text(r.product) },
    { label: 'Kết quả', cls: 'vtable__res', render: (r) => resultBadge(r.result) },
    { label: 'Ghi chú', cls: 'vtable__note', render: (r) => text(r.note) },
  ], rows, failRow);
}

function checklist(report, key) {
  const rows = report[key] || [];
  if (!rows.length) return nothing();
  return table('vtable--check', [
    { label: 'Nội dung', render: (r) => r.item },
    { label: 'Kết quả', cls: 'vtable__res', render: (r) => resultBadge(r.result) },
    { label: 'Ghi chú', cls: 'vtable__note', render: (r) => text(r.note) },
    {
      label: 'Hình ảnh', cls: 'vtable__img',
      render: (r) => (r.imageIds?.length
        ? h('button', { class: 'btn btn--soft btn--sm', type: 'button', onClick: () => openImageViewer(r.imageIds, 0, { title: r.item }) },
          icon('image', { size: 15 }), `${r.imageIds.length} ảnh`)
        : '—'),
    },
  ], rows, failRow);
}

function temperature(report) {
  const rows = report.temperature || [];
  return h('div', { class: 'vtemps' }, rows.map((r) => h('div', { class: 'vtemp' },
    h('span', { class: 'vtemp__name' }, r.item),
    h('span', { class: 'vtemp__val num' }, r.value == null ? '—' : `${formatNumber(r.value)} °C`))));
}

function samples(report) {
  const rows = report.samples || [];
  if (!rows.length) return nothing();
  return table('vtable--samples', [
    { label: '#', cls: 'vtable__idx num', render: (_, i) => i + 1 },
    { label: 'Tên sản phẩm', render: (r) => text(r.product) },
    { label: 'Lô hàng', render: (r) => text(r.lot) },
    { label: 'Số lượng', render: (r) => text(r.quantity) },
  ], rows);
}

function lineAreas(report) {
  const areas = report.lineAreas || [];
  if (!areas.length) return nothing();
  return h('div', { class: 'vareas' }, areas.map((a) => h('div', { class: 'varea' },
    h('h4', { class: 'varea__name' }, text(a.area)),
    table('vtable--line', [
      { label: 'Hạng mục', render: (i) => i.name },
      { label: 'Kết quả', cls: 'vtable__res', render: (i) => resultBadge(i.result) },
      { label: 'Mô tả không đạt', cls: 'vtable__note', render: (i) => text(i.note) },
    ], a.items || [], failRow))));
}

function outbound(report) {
  const rows = report.outbound || [];
  if (!rows.length) return nothing();
  return table('vtable--outbound', [
    { label: '#', cls: 'vtable__idx num', render: (_, i) => i + 1 },
    { label: 'Sản phẩm', render: (r) => text(r.product) },
    { label: 'Kết quả', cls: 'vtable__res', render: (r) => resultBadge(r.result) },
    { label: 'SL không đạt', cls: 'num', render: (r) => (r.failQty == null ? '—' : formatNumber(r.failQty)) },
    { label: 'Ghi chú', cls: 'vtable__note', render: (r) => text(r.note) },
  ], rows, failRow);
}

function dispositionText(r) {
  if (!DISPOSITION_LABEL[r.disposition]) return '—';
  if (r.disposition === DISPOSITION.OTHER && !isBlank(r.dispositionNote)) return `Khác: ${r.dispositionNote}`;
  return DISPOSITION_LABEL[r.disposition];
}

function nonconformities(report) {
  const rows = report.nonconformities || [];
  if (!rows.length) return nothing('Không ghi nhận sự KPH nào');
  return table('vtable--nc', [
    { label: '#', cls: 'vtable__idx num', render: (_, i) => i + 1 },
    { label: 'Sự KPH', render: (r) => text(r.description) },
    { label: 'Nguyên nhân', render: (r) => text(r.causeName) },
    { label: 'Hình thức xử lý', render: dispositionText },
    { label: 'Số lượng', render: (r) => text(typeof r.quantity === 'number' ? formatNumber(r.quantity) : r.quantity) },
  ], rows);
}

const BODIES = {
  incoming,
  hygienePersonal: (r) => checklist(r, 'hygienePersonal'),
  hygieneOther: (r) => checklist(r, 'hygieneOther'),
  temperature,
  samples,
  lineAreas,
  outbound,
  nonconformities,
};

/* ---------------- Screen ---------------- */

export function mountReportView(container, params) {
  let destroyed = false;
  container.append(h('div', { class: 'ws-loading' }, h('span', { class: 'spinner' }), h('span', null, 'Đang mở báo cáo…')));

  const editHref = `#/report/${params.id}/edit`;

  async function load() {
    let report;
    try {
      report = await reportService.get(params.id);
    } catch (err) {
      if (destroyed) return;
      clear(container).append(h('div', { class: 'page' }, errorState({ message: errorMessage(err), onRetry: () => router.navigate(`/report/${params.id}`) })));
      return;
    }
    if (destroyed) return;
    const local = drafts.get(params.id);
    if (!report) {
      // Never saved to the server — only a local draft exists, which is only meaningful in the editor.
      if (local) { router.navigate(`/report/${params.id}/edit`, { replace: true }); return; }
      clear(container).append(h('div', { class: 'page' }, errorState({ message: 'Báo cáo không tồn tại hoặc đã bị xoá.' }),
        h('p', { class: 'center' }, h('a', { class: 'btn btn--soft', href: '#/reports' }, 'Về danh sách'))));
      return;
    }
    clear(container).append(render(report, local));
  }

  function render(report, local) {
    const summary = summarizeReport(report);
    const section = (s) => {
      const sum = summary.sections[s.key];
      return h('section', { class: ['vsec', sum.fails > 0 && 'has-fail'], 'aria-labelledby': `v-${s.key}` },
        h('h3', { class: 'vsec__title', id: `v-${s.key}` },
          s.no && h('span', { class: 'vsec__no num' }, s.no),
          h('span', null, s.title),
          sum.fails > 0 && h('span', { class: 'chip chip--fail' }, `${sum.fails} không đạt`)),
        BODIES[s.key](report));
    };

    return h('div', { class: 'page page--view' },
      h('a', { class: 'view__back', href: '#/reports' }, icon('arrowLeft', { size: 16 }), 'Danh sách báo cáo'),
      h('header', { class: 'page__head view__head' },
        h('div', null,
          h('h1', { class: 'page__title' }, formatDateLong(report.date)),
          h('p', { class: 'page__meta view__meta' },
            h('span', null, report.reporter || 'Chưa có tên'),
            h('span', { class: `status status--${report.status}` }, STATUS_LABEL[report.status]),
            report.updatedAt && h('span', null, `Cập nhật ${formatDateTime(report.updatedAt)}`))),
        h('a', { class: 'btn btn--primary page__cta', href: editHref }, icon('edit', { size: 17 }), h('span', null, 'Sửa báo cáo'))),
      local && h('div', { class: 'notice notice--warn view__notice', role: 'status' },
        icon('alert', { size: 16 }),
        h('p', null, `Trên máy này có thay đổi chưa đồng bộ (lưu lúc ${formatDateTime(local.savedAt)}). Trang này hiển thị bản trên hệ thống.`),
        h('a', { class: 'btn btn--sm btn--ghost', href: editHref }, 'Mở bản đang sửa')),
      h('div', { class: 'view__part' },
        h('h2', { class: 'view__part-title' }, h('span', { class: 'ws-part__tag' }, 'Phần 1'), 'Kiểm soát chất lượng'),
        SECTIONS.filter((s) => s.part === 1).map(section)),
      h('div', { class: 'view__part' },
        h('h2', { class: 'view__part-title' }, h('span', { class: 'ws-part__tag' }, 'Phần 2'), 'Kiểm soát sự KPH'),
        section({ ...SECTION_BY_KEY.nonconformities, title: 'Danh sách sự KPH' })),
    );
  }

  load();
  return { unmount() { destroyed = true; } };
}
