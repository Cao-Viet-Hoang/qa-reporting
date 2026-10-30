// Validation rules. Drafts are saved with minimal checks; "Hoàn tất" requires a coherent report.
// Optional sections stay optional — nothing forces the user to fill every item.
import { isBlank, isValidISODate, parseNumber } from '../core/utils.js';
import { STATUS } from './schema.js';

/**
 * Returns a list of issues: { section, rowKey?, field, message }.
 * `section` matches SECTIONS keys or 'header'.
 */
export function validateForm(form, status) {
  const issues = [];
  const add = (section, field, message, rowKey) => issues.push({ section, field, message, rowKey });

  if (!isValidISODate(form.date)) add('header', 'date', 'Chọn ngày báo cáo hợp lệ.');
  if (status === STATUS.DONE && isBlank(form.reporter)) add('header', 'reporter', 'Nhập tên người báo cáo.');

  // Numeric fields must be numbers whenever typed, for drafts too (they're stored as numbers).
  form.temperature.forEach((r) => {
    if (!parseNumber(r.value).valid) add('temperature', `temp-${r.item}`, `Nhiệt độ "${r.item}" không phải số.`);
  });
  form.outbound.forEach((r) => {
    const n = parseNumber(r.failQty);
    if (!n.valid || (n.value != null && n.value < 0)) add('outbound', 'failQty', 'Số lượng không đạt phải là số ≥ 0.', r._k);
  });

  if (status !== STATUS.DONE) return issues;

  // Completion rules: a started row must be meaningful.
  form.incoming.forEach((r) => {
    const started = r.supplierId || !isBlank(r.product) || r.result || !isBlank(r.note);
    if (!started) return;
    if (!r.supplierId) add('incoming', 'supplier', 'Dòng nguyên liệu cần chọn NCC.', r._k);
    else if (!r.result) add('incoming', 'result', `Chọn kết quả cho ${r.supplierName}.`, r._k);
  });
  form.lineAreas.forEach((a) => {
    const started = a.items.some((i) => i.result || !isBlank(i.note));
    if (started && isBlank(a.area)) add('lineAreas', 'area', 'Khu vực line cần có tên.', a._k);
  });
  form.outbound.forEach((r) => {
    const started = r.result || !isBlank(r.failQty) || !isBlank(r.note);
    if (started && isBlank(r.product)) add('outbound', 'product', 'Dòng xuất kho cần tên sản phẩm.', r._k);
  });
  form.nonconformities.forEach((r) => {
    const started = r.causeId || !isBlank(r.quantity);
    if (started && isBlank(r.description)) add('nonconformities', 'description', 'Mô tả sự KPH còn trống.', r._k);
    if (!isBlank(r.description) && !r.causeId) add('nonconformities', 'cause', 'Chọn nguyên nhân cho sự KPH.', r._k);
  });

  return issues;
}
