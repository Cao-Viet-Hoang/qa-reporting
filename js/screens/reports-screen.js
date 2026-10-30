// Report list as a dated timeline: grouped by month, each day is a row with a "section strip"
// (7 ticks for Phần 1) that reveals at a glance what was checked and where failures are.
// Rows expand in place for failing items and actions — no need to open each report.
import { h, clear, createDisposer } from '../core/dom.js';
import {
  formatDate, formatDateTime, monthLabel, parseISODate, relativeDay, weekdayShort, formatNumber,
} from '../core/utils.js';
import { STORAGE_KEYS } from '../config/app-config.js';
import { storage } from '../local/storage.js';
import { drafts } from '../local/drafts.js';
import { errorMessage } from '../data/errors.js';
import { SECTIONS, STATUS_LABEL } from '../domain/schema.js';
import { summarizeReport, failingItems } from '../domain/report-summary.js';
import { reportService } from '../services/report-service.js';
import { createDateRange, describeRange, resolveRange } from '../ui/date-range.js';
import { confirmDialog } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import { emptyState, errorState, skeletonRows } from '../ui/states.js';
import { toast } from '../ui/toast.js';

const PART1 = SECTIONS.filter((s) => s.part === 1);

function readUi() {
  return storage.get(STORAGE_KEYS.ui, {}) || {};
}
function writeUi(patch) {
  try { storage.set(STORAGE_KEYS.ui, { ...readUi(), ...patch }); } catch { /* optional */ }
}

export function mountReports(container) {
  const disposer = createDisposer();
  let range = resolveRange(readUi().reportsRange || { preset: '30d' });
  let reports = [];
  let loadToken = 0;
  let expandedId = null;

  const listEl = h('div', { class: 'timeline' });
  const countEl = h('p', { class: 'page__meta' });
  const localEl = h('section', { class: 'local-drafts', hidden: true, 'aria-label': 'Bản nháp trên máy' });
  const rangeCtl = createDateRange({
    value: range,
    onChange: (next) => { range = next; writeUi({ reportsRange: next.preset === 'custom' ? next : { preset: next.preset } }); load(); },
  });

  const newBtn = h('a', { class: 'btn btn--primary page__cta', href: '#/new' }, icon('plus', { size: 18 }), h('span', null, 'Báo cáo mới'));
  const fab = h('a', { class: 'fab', href: '#/new', 'aria-label': 'Tạo báo cáo mới' }, icon('plus', { size: 22 }));

  container.append(h('div', { class: 'page page--reports' },
    h('header', { class: 'page__head' },
      h('div', null, h('h1', { class: 'page__title' }, 'Báo cáo'), countEl),
      newBtn,
    ),
    h('div', { class: 'page__toolbar' }, rangeCtl.el),
    localEl,
    listEl,
    fab,
  ));

  /* ---------- Local, unsynced drafts ---------- */

  function renderLocalDrafts() {
    const entries = drafts.list();
    clear(localEl);
    localEl.hidden = entries.length === 0;
    if (!entries.length) return;
    localEl.append(
      h('div', { class: 'local-drafts__head' }, icon('device', { size: 15 }),
        h('span', null, 'Đang dở trên máy này'),
        h('span', { class: 'local-drafts__hint' }, 'chưa lưu lên hệ thống')),
      h('ul', { class: 'local-drafts__list' }, entries.map((e) => h('li', null,
        h('a', { class: 'local-draft', href: `#/report/${e.reportId}` },
          h('span', { class: 'local-draft__date num' }, formatDate(e.date)),
          h('span', { class: 'local-draft__who' }, e.reporter || 'Chưa có tên'),
          h('span', { class: 'local-draft__meta' }, e.isNew ? 'Báo cáo mới' : 'Sửa đổi', ' · ', formatDateTime(e.savedAt)),
          icon('chevronRight', { size: 16, cls: 'local-draft__go' }))))),
    );
  }

  /* ---------- Timeline ---------- */

  function strip(summary) {
    return h('span', { class: 'strip', 'aria-hidden': 'true' }, PART1.map((s) => {
      const sec = summary.sections[s.key];
      const state = sec.fails > 0 ? 'fail' : (sec.filled > 0 ? 'ok' : 'empty');
      return h('span', { class: `strip__tick strip__tick--${state}`, title: `${s.no}. ${s.short}` });
    }));
  }

  function row(report) {
    const summary = summarizeReport(report);
    const rel = relativeDay(report.date);
    const local = drafts.get(report.id);
    const expanded = expandedId === report.id;
    const detailId = `rd-${report.id}`;
    const failing = failingItems(report, 6);

    const facts = [
      summary.inspections > 0 && h('span', { class: 'fact' }, h('b', { class: 'num' }, summary.inspections), ' lô NL'),
      summary.fails > 0 && h('span', { class: 'fact fact--fail' }, icon('x', { size: 12 }), h('b', { class: 'num' }, summary.fails), ' không đạt'),
      summary.nc > 0 && h('span', { class: 'fact fact--nc' }, icon('flag', { size: 12 }), h('b', { class: 'num' }, summary.nc), ' KPH'),
      summary.images > 0 && h('span', { class: 'fact' }, icon('image', { size: 12 }), h('b', { class: 'num' }, summary.images)),
    ].filter(Boolean);

    const el = h('article', { class: ['day', expanded && 'is-expanded', `day--${report.status}`], 'data-id': report.id },
      h('div', { class: 'day__main' },
        h('a', { class: 'day__date', href: `#/report/${report.id}`, 'aria-label': `Mở báo cáo ${formatDate(report.date)}` },
          h('span', { class: 'day__dow' }, weekdayShort(report.date)),
          h('span', { class: 'day__num num' }, String(parseISODate(report.date).getDate()).padStart(2, '0'))),
        h('button', {
          class: 'day__body', type: 'button', 'aria-expanded': String(expanded), 'aria-controls': detailId,
          onClick: () => { expandedId = expanded ? null : report.id; renderList(); },
        },
          h('span', { class: 'day__line1' },
            h('span', { class: 'day__who' }, report.reporter || 'Chưa có tên'),
            rel && h('span', { class: 'day__rel' }, rel),
            h('span', { class: `status status--${report.status}` }, h('span', { class: 'status__dot' }), STATUS_LABEL[report.status]),
            local && h('span', { class: 'status status--local', title: 'Có thay đổi trên máy chưa đồng bộ' }, icon('device', { size: 11 }), 'Chưa đồng bộ')),
          h('span', { class: 'day__line2' },
            strip(summary),
            h('span', { class: 'day__facts' }, facts.length ? facts : h('span', { class: 'fact fact--muted' }, 'Chưa có dữ liệu kiểm tra'))),
        ),
        h('div', { class: 'day__actions' },
          h('a', { class: 'icon-btn', href: `#/report/${report.id}`, 'aria-label': 'Mở / sửa', title: 'Mở / sửa' }, icon('edit', { size: 17 })),
          h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': 'Xoá báo cáo', title: 'Xoá', onClick: () => remove(report) }, icon('trash', { size: 17 })),
        ),
      ),
      h('div', { class: 'day__detail', id: detailId, hidden: !expanded },
        h('div', { class: 'day__detail-inner' },
          h('dl', { class: 'day__sections' }, PART1.map((s) => {
            const sec = summary.sections[s.key];
            return h('div', { class: ['day__sec', sec.fails > 0 && 'has-fail', !sec.filled && 'is-empty'] },
              h('dt', null, h('span', { class: 'day__sec-no num' }, s.no), s.short),
              h('dd', null, sec.fails > 0 ? `${sec.fails} không đạt` : (sec.label || '—')));
          })),
          failing.items.length > 0 && h('div', { class: 'day__fails' },
            h('span', { class: 'day__fails-label' }, 'Không đạt'),
            h('ul', null, failing.items.map((t) => h('li', null, t)), failing.more > 0 && h('li', { class: 'more' }, `+${failing.more}`))),
          h('div', { class: 'day__detail-foot' },
            h('span', { class: 'day__stamp' }, report.updatedAt ? `Cập nhật ${formatDateTime(report.updatedAt)}` : ''),
            h('a', { class: 'btn btn--soft btn--sm', href: `#/report/${report.id}` }, report.status === 'done' ? 'Xem & sửa' : 'Tiếp tục nhập', icon('chevronRight', { size: 15 }))),
        ),
      ),
    );
    return el;
  }

  function renderList() {
    clear(listEl);
    countEl.textContent = `${describeRange(range)} · ${formatNumber(reports.length)} báo cáo`;
    if (!reports.length) {
      listEl.append(emptyState({
        icon: 'reports',
        title: range.preset === 'all' ? 'Chưa có báo cáo nào' : 'Không có báo cáo trong khoảng ngày này',
        text: range.preset === 'all' ? 'Bắt đầu bằng báo cáo đầu tiên cho hôm nay.' : 'Thử chọn khoảng ngày rộng hơn, hoặc tạo báo cáo mới.',
        action: h('a', { class: 'btn btn--primary', href: '#/new' }, icon('plus', { size: 16 }), 'Tạo báo cáo'),
      }));
      return;
    }
    let currentMonth = null;
    let group = null;
    for (const report of reports) {
      const month = report.date.slice(0, 7);
      if (month !== currentMonth) {
        currentMonth = month;
        const monthReports = reports.filter((r) => r.date.startsWith(month));
        group = h('ol', { class: 'timeline__days' });
        listEl.append(h('section', { class: 'timeline__month' },
          h('h2', { class: 'timeline__label' },
            h('span', null, monthLabel(report.date)),
            h('span', { class: 'timeline__count num' }, `${monthReports.length} báo cáo`)),
          group));
      }
      group.append(h('li', null, row(report)));
    }
  }

  async function load() {
    const token = ++loadToken;
    countEl.textContent = describeRange(range);
    clear(listEl).append(skeletonRows(5, 'skeleton--timeline'));
    try {
      const result = await reportService.list({ from: range.from, to: range.to });
      if (token !== loadToken) return;
      reports = result;
      renderList();
    } catch (err) {
      if (token !== loadToken) return;
      clear(listEl).append(errorState({ message: errorMessage(err), onRetry: load }));
    }
  }

  async function remove(report) {
    const summary = summarizeReport(report);
    await confirmDialog({
      title: `Xoá báo cáo ${formatDate(report.date)}?`,
      message: `${report.reporter || 'Chưa có tên'} · ${STATUS_LABEL[report.status]}. Thao tác này không hoàn tác được.`,
      details: summary.images > 0 && h('p', { class: 'dialog__note' }, icon('image', { size: 14 }), `${summary.images} ảnh đính kèm cũng sẽ bị xoá.`),
      confirmLabel: 'Xoá báo cáo',
      tone: 'danger',
      onConfirm: async () => {
        await reportService.remove(report);
        reports = reports.filter((r) => r.id !== report.id);
        renderList();
        renderLocalDrafts();
        toast('Đã xoá báo cáo', { type: 'success' });
      },
    });
  }

  disposer.listen(window, 'storage', renderLocalDrafts);
  renderLocalDrafts();
  load();

  return { unmount: () => disposer.dispose() };
}
