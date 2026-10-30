// Controlled mock data for the local demo mode (UI preview without Firebase). Deterministic per seed.
import { addDays, todayISO } from '../core/utils.js';
import {
  SEED_SUPPLIERS, HYGIENE_PERSONAL_ITEMS, HYGIENE_OTHER_ITEMS, TEMPERATURE_ITEMS, LINE_ITEMS,
} from '../domain/schema.js';
import { seedIdFor } from '../services/catalog-service.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAUSES = ['Bao bì rách, móp', 'Sai thông số nhiệt độ', 'Nhãn in mờ / sai', 'Dị vật trong sản phẩm', 'Hàm lượng ẩm cao', 'Thao tác sai quy trình', 'Thiếu khối lượng'];
const ACTIONS = ['Huỷ', 'Trả NCC', 'Tái chế', 'Chọn lọc lại', 'Hạ cấp sử dụng'];
const PRODUCTS = ['Bột ngọt', 'Muối tinh', 'Tiêu đen xay', 'Dầu cọ', 'Bột mì', 'Tỏi sấy', 'Ớt bột', 'Đường kính', 'Màng ghép OPP'];
const FINISHED = ['Xốt muối', 'Tương ớt', 'Tương đen', 'Gói gia vị mì', 'Dầu sa tế'];
const REPORTERS = ['QC - Nguyên', 'QC - Hạnh', 'QC - Nguyên'];
const AREAS = ['Line đóng gói 1', 'Line xốt', 'Line gia vị'];

export function buildDemoDatabase() {
  const rand = rng(20261018);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const chance = (p) => rand() < p;

  const suppliers = SEED_SUPPLIERS.map((name) => ({ id: seedIdFor(name), name, active: true }));
  const ncCauses = CAUSES.map((name, i) => ({ id: `demo-cause-${i}`, name, active: i !== CAUSES.length - 1 }));
  const ncActions = ACTIONS.map((name, i) => ({ id: `demo-action-${i}`, name, active: true }));
  // Some suppliers fail more often, so the acceptance table tells a story.
  const failBias = Object.fromEntries(suppliers.map((s, i) => [s.id, [0.32, 0.22, 0.05, 0.12][i % 4]]));

  const reports = {};
  const today = todayISO();
  for (let back = 1; back <= 46; back += 1) {
    if (chance(0.22)) continue;
    const date = addDays(today, -back);
    const id = `demo-report-${back}`;
    const ts = new Date(`${date}T16:30:00`).getTime();
    const check = (item) => {
      const r = chance(0.75) ? (chance(0.9) ? 'pass' : 'fail') : null;
      return { item, result: r, imageIds: [], note: r === 'fail' ? pick(['Chưa đội nón đúng quy định', 'Sàn còn đọng nước', 'Thiếu găng tay', 'Có bụi bẩn bám']) : '' };
    };
    const nc = [];
    const ncCount = chance(0.55) ? 1 + Math.floor(rand() * 3) : 0;
    for (let i = 0; i < ncCount; i += 1) {
      const cause = ncCauses[Math.min(ncCauses.length - 1, Math.floor(Math.pow(rand(), 1.8) * ncCauses.length))];
      const action = pick(ncActions);
      nc.push({
        description: `${pick(PRODUCTS)} — ${cause.name.toLowerCase()}`,
        causeId: cause.id, causeName: cause.name,
        actionId: action.id, actionName: action.name,
        quantity: Math.round(rand() * 40) + 1,
      });
    }
    reports[id] = {
      id,
      date,
      reporter: pick(REPORTERS),
      status: back <= 2 && chance(0.6) ? 'draft' : 'done',
      incoming: Array.from({ length: 2 + Math.floor(rand() * 5) }, () => {
        const s = pick(suppliers);
        const result = chance(failBias[s.id]) ? 'fail' : 'pass';
        return { supplierId: s.id, supplierName: s.name, product: pick(PRODUCTS), result, note: result === 'fail' ? 'Không đạt cảm quan' : '' };
      }),
      hygienePersonal: HYGIENE_PERSONAL_ITEMS.map(check),
      hygieneOther: HYGIENE_OTHER_ITEMS.map(check),
      temperature: TEMPERATURE_ITEMS.map((item, i) => ({ item, value: chance(0.85) ? Math.round(([4, 25, -18, 22][i] + (rand() - 0.5) * 4) * 10) / 10 : null })),
      samples: chance(0.6) ? [{ product: pick(FINISHED), lot: `L${date.replace(/-/g, '').slice(2)}-${1 + Math.floor(rand() * 3)}`, quantity: `${2 + Math.floor(rand() * 4)} gói` }] : [],
      lineAreas: chance(0.5) ? [{ area: pick(AREAS), items: LINE_ITEMS.map((name) => ({ name, result: chance(0.92) ? 'pass' : 'fail', note: '' })) }] : [],
      outbound: chance(0.5) ? [{ product: pick(FINISHED), result: 'pass', failQty: null, note: '' }] : [],
      nonconformities: nc,
      createdAt: ts,
      updatedAt: ts + 3600_000,
    };
  }
  return { suppliers, ncCauses, ncActions, reports };
}
