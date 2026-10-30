// Business schema from PLAN.md §3 and §7 — the only place fixed items and labels are defined.
import { uid, parseNumber, cleanName, isBlank } from '../core/utils.js';

export const RESULT = Object.freeze({ PASS: 'pass', FAIL: 'fail' });
export const STATUS = Object.freeze({ DRAFT: 'draft', DONE: 'done' });

export const STATUS_LABEL = { draft: 'Nháp', done: 'Hoàn tất', new: 'Chưa lưu' };
export const RESULT_LABEL = { pass: 'Đạt', fail: 'Không đạt' };

export const CATALOG_TYPES = {
  suppliers: { key: 'suppliers', label: 'Nhà cung cấp', singular: 'nhà cung cấp' },
  ncCauses: { key: 'ncCauses', label: 'Nguyên nhân KPH', singular: 'nguyên nhân' },
  ncActions: { key: 'ncActions', label: 'Hình thức xử lý', singular: 'hình thức xử lý' },
};

export const SEED_SUPPLIERS = [
  'CHOWON KITCHEN', 'PHONG VÂN', 'TRI KING', 'NAM DƯƠNG',
  'HÀNG TIÊU DÙNG BIÊN HÒA', 'BÍCH CƠ', 'THỰC PHẨM NAUY', 'SỨC SỐNG MỚI',
  'MUỐI THÀNH PHÁT', 'AJINOMOTO VIỆT NAM', 'BRENNTAG VIỆT NAM', 'PALDO VINA',
  'VINA AROMA', 'TRÍ VIỆT PHÁT', 'HỢP TÁC XÃ THƯƠNG MẠI - SẢN XUẤT NÔNG NGHIỆP VINA',
  'SAIGON VE WONG', 'THỰC PHẨM N F C (Nature)', 'PHÚ CƯỜNG', 'MIHACO',
];

export const HYGIENE_PERSONAL_ITEMS = [
  'Phòng BHLĐ 1', 'Phòng BHLĐ 2', 'Phòng đóng gói gia vị', 'Phòng đóng gói dầu – xốt', 'Khu đóng gói mì',
];
export const HYGIENE_OTHER_ITEMS = ['Khu vực SX', 'Dụng cụ', 'Máy móc thiết bị', 'Kho'];
export const TEMPERATURE_ITEMS = ['Tủ mát', 'Kho NL', 'Kho BTP', 'Kho TP'];
export const LINE_ITEMS = ['Thao tác', 'Thông số kỹ thuật', 'BTP', 'Thành phẩm'];

export const SECTIONS = [
  { key: 'incoming', no: '1', part: 1, title: 'Kiểm tra nguyên liệu / nguyên vật liệu đầu vào', short: 'Nguyên liệu đầu vào', hint: 'Mỗi dòng là một lần kiểm lô hàng của NCC — dùng để tính tỉ lệ chấp nhận.' },
  { key: 'hygienePersonal', no: '2', part: 1, title: 'Vệ sinh cá nhân, BHLĐ nhân viên sản xuất', short: 'Vệ sinh cá nhân, BHLĐ', hint: 'Không bắt buộc điền hết — có thông tin gì điền nấy.' },
  { key: 'hygieneOther', no: '3', part: 1, title: 'Vệ sinh các hạng mục khác', short: 'Vệ sinh hạng mục khác', hint: 'Không bắt buộc điền hết.' },
  { key: 'temperature', no: '4', part: 1, title: 'Kiểm tra nhiệt độ kho bảo quản', short: 'Nhiệt độ kho', hint: 'Nhiệt độ thực tế (°C), nhập được số âm.' },
  { key: 'samples', no: '5', part: 1, title: 'Mẫu lưu', short: 'Mẫu lưu' },
  { key: 'lineAreas', no: '6', part: 1, title: 'Kiểm soát line sản xuất', short: 'Line sản xuất', hint: 'Mỗi khu vực gồm 4 hạng mục. Không bắt buộc điền.' },
  { key: 'outbound', no: '7', part: 1, title: 'Kiểm tra xuất kho', short: 'Xuất kho' },
  { key: 'nonconformities', no: '', part: 2, title: 'Kiểm soát sự KPH', short: 'Sự KPH', hint: 'Ghi nhận từng sự không phù hợp để tìm nguyên nhân xuất hiện nhiều nhất.' },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

/* ---------- Row factories (form state; `_k` is a local-only row key) ---------- */

const checkItem = (item) => ({ item, result: null, imageIds: [], note: '' });

export const createRow = {
  incoming: () => ({ _k: uid(8), supplierId: null, supplierName: '', product: '', result: null, note: '' }),
  samples: () => ({ _k: uid(8), product: '', lot: '', quantity: '' }),
  lineAreas: () => ({ _k: uid(8), area: '', items: LINE_ITEMS.map((name) => ({ name, result: null, note: '' })) }),
  outbound: () => ({ _k: uid(8), product: '', result: null, failQty: '', note: '' }),
  nonconformities: () => ({ _k: uid(8), description: '', causeId: null, causeName: '', actionId: null, actionName: '', quantity: '' }),
};

export function createEmptyForm({ date, reporter }) {
  return {
    date,
    reporter: reporter || '',
    status: STATUS.DRAFT,
    incoming: [createRow.incoming()],
    hygienePersonal: HYGIENE_PERSONAL_ITEMS.map(checkItem),
    hygieneOther: HYGIENE_OTHER_ITEMS.map(checkItem),
    temperature: TEMPERATURE_ITEMS.map((item) => ({ item, value: '' })),
    samples: [],
    lineAreas: [],
    outbound: [],
    nonconformities: [],
  };
}

/* ---------- Firestore <-> form mapping ---------- */

const str = (v) => (v == null ? '' : String(v));
const numText = (v) => (v == null ? '' : String(v).replace('.', ','));
const result = (v) => (v === RESULT.PASS || v === RESULT.FAIL ? v : null);

/** Fixed lists keep PLAN.md order; unknown stored items (future renames) are appended, never dropped. */
function mergeFixed(fixedNames, stored, makeEmpty, mapStored) {
  const byItem = new Map((stored || []).map((row) => [row.item, row]));
  const rows = fixedNames.map((name) => (byItem.has(name) ? mapStored(byItem.get(name)) : makeEmpty(name)));
  (stored || []).forEach((row) => { if (!fixedNames.includes(row.item)) rows.push(mapStored(row)); });
  return rows;
}

export function reportToForm(doc) {
  return {
    date: doc.date,
    reporter: str(doc.reporter),
    status: doc.status === STATUS.DONE ? STATUS.DONE : STATUS.DRAFT,
    incoming: (doc.incoming || []).map((r) => ({
      _k: uid(8), supplierId: r.supplierId || null, supplierName: str(r.supplierName),
      product: str(r.product), result: result(r.result), note: str(r.note),
    })),
    hygienePersonal: mergeFixed(HYGIENE_PERSONAL_ITEMS, doc.hygienePersonal, checkItem, mapCheck),
    hygieneOther: mergeFixed(HYGIENE_OTHER_ITEMS, doc.hygieneOther, checkItem, mapCheck),
    temperature: mergeFixed(TEMPERATURE_ITEMS, doc.temperature, (item) => ({ item, value: '' }),
      (r) => ({ item: r.item, value: numText(r.value) })),
    samples: (doc.samples || []).map((r) => ({ _k: uid(8), product: str(r.product), lot: str(r.lot), quantity: str(r.quantity) })),
    lineAreas: (doc.lineAreas || []).map((a) => ({
      _k: uid(8),
      area: str(a.area),
      items: mergeLineItems(a.items),
    })),
    outbound: (doc.outbound || []).map((r) => ({
      _k: uid(8), product: str(r.product), result: result(r.result), failQty: numText(r.failQty), note: str(r.note),
    })),
    nonconformities: (doc.nonconformities || []).map((r) => ({
      _k: uid(8), description: str(r.description),
      causeId: r.causeId || null, causeName: str(r.causeName),
      actionId: r.actionId || null, actionName: str(r.actionName),
      quantity: numText(r.quantity),
    })),
  };
}

function mapCheck(r) {
  return { item: r.item, result: result(r.result), imageIds: Array.isArray(r.imageIds) ? [...r.imageIds] : [], note: str(r.note) };
}

function mergeLineItems(items) {
  const byName = new Map((items || []).map((i) => [i.name, i]));
  const rows = LINE_ITEMS.map((name) => {
    const i = byName.get(name);
    return { name, result: result(i?.result), note: str(i?.note) };
  });
  (items || []).forEach((i) => { if (!LINE_ITEMS.includes(i.name)) rows.push({ name: i.name, result: result(i.result), note: str(i.note) }); });
  return rows;
}

/** Converts form state to the Firestore document shape (PLAN.md §7). Empty dynamic rows are dropped. */
export function formToReport(form) {
  const t = (v) => cleanName(v);
  const n = (v) => parseNumber(v).value;
  return {
    date: form.date,
    reporter: t(form.reporter),
    incoming: form.incoming
      .filter((r) => r.supplierId || !isBlank(r.product) || r.result || !isBlank(r.note))
      .map((r) => ({ supplierId: r.supplierId || null, supplierName: r.supplierId ? r.supplierName : '', product: t(r.product), result: r.result, note: t(r.note) })),
    hygienePersonal: form.hygienePersonal.map(checkToDoc),
    hygieneOther: form.hygieneOther.map(checkToDoc),
    temperature: form.temperature.map((r) => ({ item: r.item, value: n(r.value) })),
    samples: form.samples
      .filter((r) => !isBlank(r.product) || !isBlank(r.lot) || !isBlank(r.quantity))
      .map((r) => ({ product: t(r.product), lot: t(r.lot), quantity: t(r.quantity) })),
    lineAreas: form.lineAreas
      .filter((a) => !isBlank(a.area) || a.items.some((i) => i.result || !isBlank(i.note)))
      .map((a) => ({ area: t(a.area), items: a.items.map((i) => ({ name: i.name, result: i.result, note: t(i.note) })) })),
    outbound: form.outbound
      .filter((r) => !isBlank(r.product) || r.result || !isBlank(r.failQty) || !isBlank(r.note))
      .map((r) => ({ product: t(r.product), result: r.result, failQty: n(r.failQty), note: t(r.note) })),
    nonconformities: form.nonconformities
      .filter((r) => !isBlank(r.description) || r.causeId || r.actionId || !isBlank(r.quantity))
      .map((r) => ({
        description: t(r.description),
        causeId: r.causeId || null, causeName: r.causeId ? r.causeName : '',
        actionId: r.actionId || null, actionName: r.actionId ? r.actionName : '',
        quantity: n(r.quantity),
      })),
  };
}

function checkToDoc(r) {
  return { item: r.item, result: r.result, imageIds: [...(r.imageIds || [])], note: cleanName(r.note) };
}

/** Every image id referenced by a report (form state or Firestore doc). */
export function collectImageIds(report) {
  if (!report) return [];
  return [...(report.hygienePersonal || []), ...(report.hygieneOther || [])].flatMap((r) => r.imageIds || []);
}
