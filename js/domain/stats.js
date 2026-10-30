// Statistics formulas — PLAN.md §4. Pure functions over report documents.
import { RESULT } from './schema.js';
import { addDays, parseISODate, toISODate } from '../core/utils.js';

/** NC quantity is free text with a unit ("12 kg", "3,5 thùng"); totals use its leading number. */
export function qtyValue(q) {
  if (typeof q === 'number') return Number.isFinite(q) ? q : 0;
  const m = String(q ?? '').match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : 0;
}

const keyOf = (id, name) => id || `name:${name}`;

/**
 * Supplier acceptance (method A): every incoming row with a supplier and a chosen result is one inspection.
 * Rate = pass / inspections. Sorted by rate ascending (worst first).
 * Rows with no result yet are not inspections. Supplier names use the latest snapshot seen in the range.
 */
export function supplierAcceptance(reports) {
  const map = new Map();
  for (const report of reports) {
    for (const row of report.incoming || []) {
      if (!row.supplierId && !row.supplierName) continue;
      if (row.result !== RESULT.PASS && row.result !== RESULT.FAIL) continue;
      const key = keyOf(row.supplierId, row.supplierName);
      const entry = map.get(key) || { id: row.supplierId, name: row.supplierName, inspections: 0, passes: 0, lastDate: '' };
      entry.inspections += 1;
      if (row.result === RESULT.PASS) entry.passes += 1;
      if (report.date >= entry.lastDate) { entry.lastDate = report.date; entry.name = row.supplierName || entry.name; }
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, fails: e.inspections - e.passes, rate: e.passes / e.inspections }))
    .sort((a, b) => a.rate - b.rate || b.inspections - a.inspections || a.name.localeCompare(b.name, 'vi'));
}

function tally(reports, idKey, nameKey, withQty) {
  const map = new Map();
  for (const report of reports) {
    for (const row of report.nonconformities || []) {
      if (!row[idKey] && !row[nameKey]) continue;
      const key = keyOf(row[idKey], row[nameKey]);
      const entry = map.get(key) || { id: row[idKey], name: row[nameKey], count: 0, quantity: 0, lastDate: '' };
      entry.count += 1;
      if (withQty) entry.quantity += qtyValue(row.quantity);
      if (report.date >= entry.lastDate) { entry.lastDate = report.date; entry.name = row[nameKey] || entry.name; }
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

/** NC causes: occurrences + total quantity. Most frequent first. */
export function ncCauseStats(reports) {
  return tally(reports, 'causeId', 'causeName', true)
    .sort((a, b) => b.count - a.count || b.quantity - a.quantity || a.name.localeCompare(b.name, 'vi'));
}

/**
 * Pareto view of NC causes by `metric` ('count' | 'quantity'), largest first.
 * `share` / `cumulative` are fractions of the total; `vital` marks the causes that together
 * make up the first 80% (the cause that crosses 80% is included).
 */
export function paretoCauses(causes, metric = 'count', cut = 0.8) {
  const rows = [...causes].sort((a, b) => b[metric] - a[metric] || b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  const total = rows.reduce((n, r) => n + r[metric], 0);
  let before = 0;
  return rows.map((r) => {
    const share = total ? r[metric] / total : 0;
    const out = { ...r, value: r[metric], share, cumulative: before + share, vital: total > 0 && r[metric] > 0 && before < cut };
    before += share;
    return out;
  });
}

const BUCKETS = {
  day: { start: (iso) => iso, next: (iso) => addDays(iso, 1) },
  week: { start: (iso) => addDays(iso, -((parseISODate(iso).getDay() + 6) % 7)), next: (iso) => addDays(iso, 7) },
  month: {
    start: (iso) => `${iso.slice(0, 7)}-01`,
    next: (iso) => { const d = parseISODate(iso); return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1)); },
  },
};

/**
 * Acceptance rate and NC count over time, oldest first. Buckets by day; by week past ~2 months,
 * by month past ~1 year. Empty buckets are kept so the time axis stays even.
 * Open range bounds fall back to the first / last report date.
 */
export function trendSeries(reports, { from, to } = {}) {
  const dates = reports.map((r) => r.date).filter(Boolean).sort();
  if (!dates.length) return { unit: 'day', buckets: [] };
  const start = from || dates[0];
  const end = to || dates[dates.length - 1];
  const days = Math.round((parseISODate(end) - parseISODate(start)) / 86400000) + 1;
  const unit = days > 400 ? 'month' : days > 62 ? 'week' : 'day';
  const b = BUCKETS[unit];

  const map = new Map();
  for (let key = b.start(start); key <= end; key = b.next(key)) {
    map.set(key, { key, end: addDays(b.next(key), -1), inspections: 0, passes: 0, ncCount: 0, ncQuantity: 0 });
  }
  for (const report of reports) {
    const entry = map.get(b.start(report.date));
    if (!entry) continue;
    for (const row of report.incoming || []) {
      if (!row.supplierId && !row.supplierName) continue;
      if (row.result !== RESULT.PASS && row.result !== RESULT.FAIL) continue;
      entry.inspections += 1;
      if (row.result === RESULT.PASS) entry.passes += 1;
    }
    for (const row of report.nonconformities || []) {
      entry.ncCount += 1;
      entry.ncQuantity += qtyValue(row.quantity);
    }
  }
  const buckets = [...map.values()].map((e) => ({ ...e, rate: e.inspections ? e.passes / e.inspections : null }));
  return { unit, buckets };
}

export function rangeSummary(reports) {
  const ncRows = reports.flatMap((r) => r.nonconformities || []);
  const inspected = reports.flatMap((r) => r.incoming || []).filter((x) => x.result && (x.supplierId || x.supplierName));
  return {
    reports: reports.length,
    inspections: inspected.length,
    passes: inspected.filter((x) => x.result === RESULT.PASS).length,
    ncCount: ncRows.length,
    ncQuantity: ncRows.reduce((n, r) => n + qtyValue(r.quantity), 0),
    ncUnclassified: ncRows.filter((r) => !r.causeId && !r.causeName).length,
  };
}
