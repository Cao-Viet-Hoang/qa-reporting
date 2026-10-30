// Statistics formulas — PLAN.md §4. Pure functions over report documents.
import { RESULT } from './schema.js';

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
      if (withQty && typeof row.quantity === 'number') entry.quantity += row.quantity;
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

/** NC actions: number of uses. Most used first. */
export function ncActionStats(reports) {
  return tally(reports, 'actionId', 'actionName', false)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

export function rangeSummary(reports) {
  const ncRows = reports.flatMap((r) => r.nonconformities || []);
  return {
    reports: reports.length,
    inspections: reports.reduce((n, r) => n + (r.incoming || []).filter((x) => x.result && (x.supplierId || x.supplierName)).length, 0),
    ncCount: ncRows.length,
    ncUnclassified: ncRows.filter((r) => !r.causeId && !r.causeName).length,
  };
}
