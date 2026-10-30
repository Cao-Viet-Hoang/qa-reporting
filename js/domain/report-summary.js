// Derived, display-only information about a report (works on form state or stored documents).
import { isBlank } from '../core/utils.js';
import { RESULT, SECTIONS } from './schema.js';

const hasResult = (r) => r.result === RESULT.PASS || r.result === RESULT.FAIL;

/** Per-section summary: { filled, total, fails, passes, images, label } */
export function summarizeSection(key, form) {
  const rows = form[key] || [];
  switch (key) {
    case 'incoming': {
      const used = rows.filter((r) => r.supplierId || !isBlank(r.product) || hasResult(r));
      return base(used.length, used.filter(hasResult).length, rows, {
        label: used.length ? `${used.length} lô kiểm` : null,
      });
    }
    case 'hygienePersonal':
    case 'hygieneOther': {
      const done = rows.filter(hasResult).length;
      return base(done, done, rows, {
        total: rows.length,
        images: rows.reduce((n, r) => n + (r.imageIds?.length || 0), 0),
        label: done ? `${done}/${rows.length} đã đánh giá` : null,
      });
    }
    case 'temperature': {
      const done = rows.filter((r) => !isBlank(r.value)).length;
      return { filled: done, total: rows.length, fails: 0, passes: 0, images: 0, label: done ? `${done}/${rows.length} kho` : null };
    }
    case 'samples': {
      const used = rows.filter((r) => !isBlank(r.product) || !isBlank(r.lot));
      return { filled: used.length, fails: 0, passes: 0, images: 0, label: used.length ? `${used.length} mẫu` : null };
    }
    case 'lineAreas': {
      const items = rows.flatMap((a) => a.items);
      const used = rows.filter((a) => !isBlank(a.area) || a.items.some(hasResult));
      return {
        filled: used.length,
        fails: items.filter((i) => i.result === RESULT.FAIL).length,
        passes: items.filter((i) => i.result === RESULT.PASS).length,
        images: 0,
        label: used.length ? `${used.length} khu vực` : null,
      };
    }
    case 'outbound': {
      const used = rows.filter((r) => !isBlank(r.product) || hasResult(r));
      return base(used.length, used.filter(hasResult).length, rows, { label: used.length ? `${used.length} sản phẩm` : null });
    }
    case 'nonconformities': {
      const used = rows.filter((r) => !isBlank(r.description) || r.causeId);
      return { filled: used.length, fails: 0, passes: 0, images: 0, label: used.length ? `${used.length} sự KPH` : null };
    }
    default:
      return { filled: 0, fails: 0, passes: 0, images: 0, label: null };
  }
}

function base(filled, evaluated, rows, extra) {
  return {
    filled,
    evaluated,
    fails: rows.filter((r) => r.result === RESULT.FAIL).length,
    passes: rows.filter((r) => r.result === RESULT.PASS).length,
    images: 0,
    ...extra,
  };
}

/** Whole-report overview for headers and list rows. */
export function summarizeReport(report) {
  const sections = Object.fromEntries(SECTIONS.map((s) => [s.key, summarizeSection(s.key, report)]));
  const part1 = SECTIONS.filter((s) => s.part === 1);
  return {
    sections,
    touchedSections: part1.filter((s) => sections[s.key].filled > 0).length,
    part1Total: part1.length,
    fails: part1.reduce((n, s) => n + sections[s.key].fails, 0),
    passes: part1.reduce((n, s) => n + sections[s.key].passes, 0),
    images: sections.hygienePersonal.images + sections.hygieneOther.images,
    nc: sections.nonconformities.filled,
    inspections: sections.incoming.filled,
  };
}

/** Short list of failing items, for list previews ("Kho NL", "CHOWON KITCHEN · Bột"...). */
export function failingItems(report, limit = 4) {
  const out = [];
  (report.incoming || []).forEach((r) => r.result === RESULT.FAIL && out.push(r.supplierName || r.product || 'NCC'));
  [...(report.hygienePersonal || []), ...(report.hygieneOther || [])].forEach((r) => r.result === RESULT.FAIL && out.push(r.item));
  (report.lineAreas || []).forEach((a) => a.items.forEach((i) => i.result === RESULT.FAIL && out.push(`${a.area || 'Line'} · ${i.name}`)));
  (report.outbound || []).forEach((r) => r.result === RESULT.FAIL && out.push(r.product || 'Xuất kho'));
  return { items: out.slice(0, limit), more: Math.max(0, out.length - limit) };
}
