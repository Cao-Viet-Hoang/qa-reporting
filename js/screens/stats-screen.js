// Statistics (PLAN.md §4). Everything below is scoped by one date range:
//  · KPI row — overall acceptance rate, inspections, NC count / quantity, suppliers under threshold;
//  · trend — acceptance rate (line) above NC count (columns) on a shared time axis;
//  · NC causes — Pareto chart (by occurrences or by quantity) with a ranked list as its legend;
//  · supplier acceptance (method A) — worst first, as a ranked table with an inline rate meter.
import { h, clear, createDisposer } from '../core/dom.js';
import { STORAGE_KEYS } from '../config/app-config.js';
import { formatNumber, formatPercent } from '../core/utils.js';
import { storage } from '../local/storage.js';
import { errorMessage } from '../data/errors.js';
import { supplierAcceptance, ncCauseStats, paretoCauses, trendSeries, rangeSummary } from '../domain/stats.js';
import { reportService } from '../services/report-service.js';
import { createTrendChart, createParetoChart } from '../ui/charts.js';
import { createDateRange, describeRange, resolveRange } from '../ui/date-range.js';
import { icon } from '../ui/icons.js';
import { emptyState, errorState, skeletonRows } from '../ui/states.js';

const ATTENTION_RATE = 0.8;
const PARETO_CUT = 0.8;
const PARETO_MAX = 10; // causes past this fold into "Khác"

function readUi() { return storage.get(STORAGE_KEYS.ui, {}) || {}; }
function writeUi(patch) { try { storage.set(STORAGE_KEYS.ui, { ...readUi(), ...patch }); } catch { /* optional */ } }

export function mountStats(container) {
  const disposer = createDisposer();
  let range = resolveRange(readUi().statsRange || { preset: '30d' });
  let token = 0;
  let paretoMetric = readUi().paretoMetric === 'quantity' ? 'quantity' : 'count';
  let charts = [];

  const metaEl = h('p', { class: 'page__meta' });
  const body = h('div', { class: 'stats' });
  const rangeCtl = createDateRange({
    value: range,
    onChange: (next) => { range = next; writeUi({ statsRange: next.preset === 'custom' ? next : { preset: next.preset } }); load(); },
  });

  container.append(h('div', { class: 'page page--stats' },
    h('header', { class: 'page__head' }, h('div', null, h('h1', { class: 'page__title' }, 'Thống kê'), metaEl)),
    h('div', { class: 'page__toolbar' }, rangeCtl.el),
    body,
  ));

  /* ---------- Supplier acceptance ---------- */

  function supplierBlock(rows) {
    const attention = rows.filter((r) => r.rate < ATTENTION_RATE).length;
    return h('section', { class: 'panel panel--suppliers', 'aria-labelledby': 'st-sup' },
      h('header', { class: 'panel__head' },
        h('div', null,
          h('h2', { class: 'panel__title', id: 'st-sup' }, 'Tỉ lệ chấp nhận nhà cung cấp'),
          h('p', { class: 'panel__sub' }, 'Mỗi dòng ở ý 1 là 1 lần kiểm · Tỉ lệ = số lần Đạt / số lần kiểm · thấp nhất ở trên')),
        attention > 0 && h('span', { class: 'flag-pill' }, icon('alert', { size: 13 }), `${attention} NCC dưới ${formatPercent(ATTENTION_RATE)}`)),
      rows.length === 0
        ? emptyState({ icon: 'stats', title: 'Chưa có lần kiểm nào', text: 'Không có dòng nguyên liệu đầu vào nào có kết quả trong khoảng ngày này.' })
        : h('div', { class: 'acc' },
            h('table', { class: 'acc__table' },
              h('caption', { class: 'sr-only' }, 'Tỉ lệ chấp nhận theo nhà cung cấp'),
              h('thead', null, h('tr', null,
                h('th', { scope: 'col', class: 'acc__name-h' }, 'Nhà cung cấp'),
                h('th', { scope: 'col', class: 'acc__num-h' }, 'Số lần kiểm'),
                h('th', { scope: 'col', class: 'acc__num-h' }, 'Số lần Đạt'),
                h('th', { scope: 'col', class: 'acc__rate-h' }, 'Tỉ lệ'))),
              h('tbody', null, rows.map((r) => {
                const low = r.rate < ATTENTION_RATE;
                return h('tr', { class: ['acc__row', low && 'is-low'] },
                  h('th', { scope: 'row', class: 'acc__name' },
                    h('span', { class: 'acc__name-text' }, r.name),
                    h('span', { class: 'acc__mobile-meta num' }, `${r.passes}/${r.inspections} lần đạt`)),
                  h('td', { class: 'acc__num num' }, formatNumber(r.inspections)),
                  h('td', { class: 'acc__num num' }, formatNumber(r.passes)),
                  h('td', { class: 'acc__rate' },
                    h('span', { class: 'meter', role: 'img', 'aria-label': `${formatPercent(r.rate)} — ${r.passes}/${r.inspections} lần đạt`, title: `${r.passes} đạt · ${r.fails} không đạt` },
                      h('span', { class: 'meter__fill', style: { width: `${Math.max(r.rate * 100, 0)}%` } })),
                    h('span', { class: 'acc__pct num' }, low && icon('alert', { size: 12, cls: 'acc__warn' }), formatPercent(r.rate))));
              })))),
    );
  }

  /* ---------- KPI row ---------- */

  function kpiRow(summary, suppliers) {
    const rate = summary.inspections ? summary.passes / summary.inspections : null;
    const low = suppliers.filter((r) => r.rate < ATTENTION_RATE).length;
    const tile = (label, value, sub, cls) => h('div', { class: ['kpi', cls] },
      h('p', { class: 'kpi__label' }, label),
      h('p', { class: 'kpi__value' }, value),
      h('p', { class: 'kpi__sub' }, sub));
    return h('section', { class: 'kpis', 'aria-label': 'Tổng quan' },
      tile('Tỉ lệ chấp nhận chung', rate == null ? '—' : formatPercent(rate),
        summary.inspections ? h('span', { class: 'num' }, `${formatNumber(summary.passes)}/${formatNumber(summary.inspections)} lần đạt`) : 'Chưa có lần kiểm',
        rate != null && rate < ATTENTION_RATE && 'is-low'),
      tile('Lần kiểm nguyên liệu', formatNumber(summary.inspections), h('span', { class: 'num' }, `${formatNumber(summary.reports)} báo cáo`)),
      tile('Sự KPH', formatNumber(summary.ncCount), h('span', { class: 'num' }, `Tổng SL ${formatNumber(summary.ncQuantity)}`)),
      tile(`NCC dưới ${formatPercent(ATTENTION_RATE)}`, formatNumber(low),
        low ? [icon('alert', { size: 12 }), ` trên ${formatNumber(suppliers.length)} NCC`] : `Tất cả ${formatNumber(suppliers.length)} NCC đạt`,
        low > 0 && 'is-low'),
    );
  }

  /* ---------- Trend ---------- */

  function trendBlock(reports) {
    const { unit, buckets } = trendSeries(reports, range);
    const unitText = { day: 'theo ngày', week: 'theo tuần', month: 'theo tháng' }[unit];
    const chart = buckets.length > 1 ? createTrendChart({ buckets, unit, threshold: ATTENTION_RATE }) : null;
    if (chart) charts.push(chart);
    return h('section', { class: 'panel panel--trend', 'aria-labelledby': 'st-trend' },
      h('header', { class: 'panel__head' },
        h('div', null,
          h('h2', { class: 'panel__title', id: 'st-trend' }, 'Diễn biến chất lượng'),
          h('p', { class: 'panel__sub' }, `Tỉ lệ chấp nhận NL và số sự KPH ${unitText} · rê chuột hoặc dùng phím ←/→ để xem chi tiết`)),
        h('ul', { class: 'legend' },
          h('li', null, h('span', { class: 'legend__key legend__key--line' }), 'Tỉ lệ chấp nhận'),
          h('li', null, h('span', { class: 'legend__key legend__key--nc' }), 'Số sự KPH'))),
      chart ? chart.el : h('p', { class: 'panel__foot' }, icon('info', { size: 13 }), 'Cần khoảng ngày dài hơn 1 ngày để xem diễn biến.'),
    );
  }

  /* ---------- NC causes: Pareto ---------- */

  /** Long tails fold into one "Khác" bar, which always sits last. */
  function foldTail(causes) {
    if (causes.length <= PARETO_MAX) return causes;
    const tail = causes.slice(PARETO_MAX - 1);
    return [...causes.slice(0, PARETO_MAX - 1), {
      id: null, name: `Khác (${tail.length} nguyên nhân)`, other: true,
      count: tail.reduce((n, r) => n + r.count, 0), quantity: tail.reduce((n, r) => n + r.quantity, 0),
    }];
  }

  function causeBlock(causes, unclassified) {
    const unitLabel = () => (paretoMetric === 'count' ? 'lần' : 'sản phẩm');
    const seg = h('div', { class: 'seg seg--inline', role: 'radiogroup', 'aria-label': 'Tính theo' },
      [['count', 'Số lần'], ['quantity', 'Số lượng']].map(([key, label]) => h('button', {
        class: 'seg__btn', type: 'button', role: 'radio', 'data-key': key,
        onClick: () => { paretoMetric = key; writeUi({ paretoMetric: key }); paint(); },
      }, label)));
    const bodyEl = h('div', { class: 'pareto' });
    const panel = h('section', { class: 'panel panel--causes', 'aria-labelledby': 'st-cause' },
      h('header', { class: 'panel__head' },
        h('div', null,
          h('h2', { class: 'panel__title', id: 'st-cause' }, 'Nguyên nhân KPH'),
          h('p', { class: 'panel__sub' }, `Biểu đồ Pareto · cột đậm là nhóm nguyên nhân chiếm ${formatPercent(PARETO_CUT)} tổng — ưu tiên kiểm soát nhóm này`)),
        causes.length > 0 && seg),
      bodyEl,
      unclassified > 0 && h('p', { class: 'panel__foot' }, icon('info', { size: 13 }), `${unclassified} sự KPH chưa chọn nguyên nhân không được tính.`),
    );

    let chart = null;
    function paint() {
      seg.querySelectorAll('.seg__btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.key === paretoMetric)));
      if (chart) { chart.destroy(); charts = charts.filter((c) => c !== chart); chart = null; }
      clear(bodyEl);
      if (!causes.length) {
        bodyEl.append(emptyState({ icon: 'flag', title: 'Chưa có sự KPH được phân loại', text: 'Không có sự KPH nào có nguyên nhân trong khoảng ngày này.' }));
        return;
      }
      const folded = foldTail(causes);
      const rows = paretoCauses(folded.filter((r) => !r.other), paretoMetric, PARETO_CUT);
      const other = folded.find((r) => r.other);
      if (other) {
        const total = folded.reduce((n, r) => n + r[paretoMetric], 0);
        const scale = total ? (total - other[paretoMetric]) / total : 1;
        rows.forEach((r) => { r.share *= scale; r.cumulative *= scale; });
        let acc = 0;
        rows.forEach((r) => { r.vital = r.value > 0 && acc < PARETO_CUT; acc += r.share; });
        rows.push({ ...other, value: other[paretoMetric], share: total ? other[paretoMetric] / total : 0, cumulative: 1, vital: false });
      }
      if (rows.every((r) => r.value === 0)) {
        bodyEl.append(emptyState({ icon: 'flag', title: 'Chưa ghi số lượng', text: 'Các sự KPH trong khoảng ngày này chưa có số lượng.' }));
        return;
      }
      const vital = rows.filter((r) => r.vital);
      const vitalShare = vital.length ? vital[vital.length - 1].cumulative : 0;

      const items = [];
      chart = createParetoChart({
        rows, unitLabel: unitLabel(), cut: PARETO_CUT,
        onHover: (i) => items.forEach((li, k) => li.classList.toggle('is-active', k === i)),
      });
      charts.push(chart);

      const list = h('ol', { class: 'plist', 'aria-label': 'Bảng số liệu nguyên nhân KPH' }, rows.map((r, i) => {
        const li = h('li', {
          class: ['plist__row', r.vital && 'is-vital'],
          onPointerenter: () => chart.setActive(i), onPointerleave: () => chart.setActive(-1),
        },
          h('span', { class: 'plist__rank num' }, r.other ? '…' : i + 1),
          h('span', { class: 'plist__name' }, r.name),
          h('span', { class: 'plist__val num' }, h('b', null, formatNumber(r.value)), h('span', { class: 'plist__unit' }, ` ${unitLabel()}`)),
          h('span', { class: 'plist__pct num' }, formatPercent(r.share)),
          h('span', { class: 'plist__cum num' }, formatPercent(r.cumulative)));
        items.push(li);
        return li;
      }));

      bodyEl.append(
        h('p', { class: 'insight' },
          h('strong', null, `${vital.length} nguyên nhân`), ' gây ra ', h('strong', { class: 'num' }, formatPercent(vitalShare)),
          paretoMetric === 'count' ? ' số lần KPH' : ' số lượng KPH',
          h('span', { class: 'insight__meta' }, ` — nhiều nhất: ${rows[0].name}`)),
        chart.el,
        h('div', { class: 'plist__head', 'aria-hidden': 'true' },
          h('span', null, '#'), h('span', null, 'Nguyên nhân'), h('span', null, paretoMetric === 'count' ? 'Số lần' : 'Số lượng'),
          h('span', null, 'Tỉ trọng'), h('span', null, 'Luỹ kế')),
        list,
      );
    }
    paint();
    return panel;
  }

  /* ---------- Load ---------- */

  function disposeCharts() { charts.forEach((c) => c.destroy()); charts = []; }

  async function load() {
    const t = ++token;
    disposeCharts();
    metaEl.textContent = describeRange(range);
    clear(body).append(h('div', { class: 'stats__grid' },
      h('div', { class: 'panel' }, skeletonRows(6)),
      h('div', { class: 'panel' }, skeletonRows(4))));
    try {
      const reports = await reportService.list({ from: range.from, to: range.to });
      if (t !== token) return;
      const summary = rangeSummary(reports);
      metaEl.replaceChildren(
        describeRange(range), ' · ',
        h('span', { class: 'num' }, formatNumber(summary.reports)), ' báo cáo · ',
        h('span', { class: 'num' }, formatNumber(summary.inspections)), ' lần kiểm NL · ',
        h('span', { class: 'num' }, formatNumber(summary.ncCount)), ' sự KPH',
      );
      clear(body);
      if (!reports.length) {
        body.append(emptyState({ icon: 'stats', title: 'Không có báo cáo trong khoảng ngày này', text: 'Chọn khoảng ngày khác để xem thống kê.' }));
        return;
      }
      const suppliers = supplierAcceptance(reports);
      body.append(
        kpiRow(summary, suppliers),
        trendBlock(reports),
        h('div', { class: 'stats__grid' },
          causeBlock(ncCauseStats(reports), summary.ncUnclassified),
          supplierBlock(suppliers)));
    } catch (err) {
      if (t !== token) return;
      clear(body).append(errorState({ message: errorMessage(err), onRetry: load }));
    }
  }

  load();
  disposer.add(disposeCharts);
  return { unmount: () => disposer.dispose() };
}
