// Statistics (PLAN.md §4). Three analyses over one date range:
//  · supplier acceptance (method A) — worst first, as a ranked table with an inline rate meter;
//  · NC causes — horizontal bars, most frequent on top, with total quantity;
//  · NC actions — usage counts.
import { h, clear, createDisposer } from '../core/dom.js';
import { STORAGE_KEYS } from '../config/app-config.js';
import { formatNumber, formatPercent } from '../core/utils.js';
import { storage } from '../local/storage.js';
import { errorMessage } from '../data/errors.js';
import { supplierAcceptance, ncCauseStats, ncActionStats, rangeSummary } from '../domain/stats.js';
import { reportService } from '../services/report-service.js';
import { createDateRange, describeRange, resolveRange } from '../ui/date-range.js';
import { icon } from '../ui/icons.js';
import { emptyState, errorState, skeletonRows } from '../ui/states.js';

const ATTENTION_RATE = 0.8;

function readUi() { return storage.get(STORAGE_KEYS.ui, {}) || {}; }
function writeUi(patch) { try { storage.set(STORAGE_KEYS.ui, { ...readUi(), ...patch }); } catch { /* optional */ } }

export function mountStats(container) {
  const disposer = createDisposer();
  let range = resolveRange(readUi().statsRange || { preset: '30d' });
  let token = 0;

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

  /* ---------- Horizontal bars ---------- */

  function barList(rows, { valueKey, valueLabel, secondary, labelledBy }) {
    const max = Math.max(...rows.map((r) => r[valueKey]), 1);
    return h('ol', { class: 'bars', 'aria-labelledby': labelledBy }, rows.map((r, i) => h('li', { class: 'bar', tabindex: '0', title: `${r.name}: ${r[valueKey]} ${valueLabel}${secondary ? ` · ${secondary(r)}` : ''}` },
      h('span', { class: 'bar__rank num' }, i + 1),
      h('span', { class: 'bar__label' }, r.name),
      h('span', { class: 'bar__track' }, h('span', { class: 'bar__fill', style: { width: `${(r[valueKey] / max) * 100}%` } })),
      h('span', { class: 'bar__value' },
        h('b', { class: 'num' }, formatNumber(r[valueKey])), h('span', { class: 'bar__unit' }, ` ${valueLabel}`),
        secondary && h('span', { class: 'bar__secondary num' }, secondary(r))),
    )));
  }

  function causeBlock(rows, unclassified) {
    const top = rows[0];
    return h('section', { class: 'panel panel--causes', 'aria-labelledby': 'st-cause' },
      h('header', { class: 'panel__head' },
        h('div', null,
          h('h2', { class: 'panel__title', id: 'st-cause' }, 'Nguyên nhân KPH'),
          h('p', { class: 'panel__sub' }, 'Số lần xuất hiện và tổng số lượng · nhiều nhất ở trên'))),
      rows.length === 0
        ? emptyState({ icon: 'flag', title: 'Chưa có sự KPH được phân loại', text: 'Không có sự KPH nào có nguyên nhân trong khoảng ngày này.' })
        : [
            h('p', { class: 'insight' },
              'Ưu tiên kiểm soát: ', h('strong', null, top.name),
              h('span', { class: 'insight__meta num' }, ` — ${top.count} lần, ${formatNumber(top.quantity)} sản phẩm`)),
            barList(rows, { valueKey: 'count', valueLabel: 'lần', secondary: (r) => `SL ${formatNumber(r.quantity)}`, labelledBy: 'st-cause' }),
          ],
      unclassified > 0 && h('p', { class: 'panel__foot' }, icon('info', { size: 13 }), `${unclassified} sự KPH chưa chọn nguyên nhân không được tính.`),
    );
  }

  function actionBlock(rows) {
    return h('section', { class: 'panel panel--actions', 'aria-labelledby': 'st-action' },
      h('header', { class: 'panel__head' },
        h('div', null,
          h('h2', { class: 'panel__title', id: 'st-action' }, 'Hình thức xử lý'),
          h('p', { class: 'panel__sub' }, 'Số lần sử dụng'))),
      rows.length === 0
        ? emptyState({ icon: 'layers', title: 'Chưa có dữ liệu', text: 'Không có sự KPH nào được chọn hình thức xử lý.' })
        : barList(rows, { valueKey: 'count', valueLabel: 'lần', labelledBy: 'st-action' }),
    );
  }

  /* ---------- Load ---------- */

  async function load() {
    const t = ++token;
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
      body.append(h('div', { class: 'stats__grid' },
        supplierBlock(supplierAcceptance(reports)),
        h('div', { class: 'stats__col' },
          causeBlock(ncCauseStats(reports), summary.ncUnclassified),
          actionBlock(ncActionStats(reports)))));
    } catch (err) {
      if (t !== token) return;
      clear(body).append(errorState({ message: errorMessage(err), onRetry: load }));
    }
  }

  load();
  return { unmount: () => disposer.dispose() };
}
