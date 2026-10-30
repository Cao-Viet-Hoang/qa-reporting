const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 20-char random id, same shape as Firestore auto ids. */
export function uid(length = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

export function debounce(fn, wait) {
  let timer = null;
  let lastArgs = null;
  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...lastArgs); }, wait);
  };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  debounced.pending = () => timer !== null;
  return debounced;
}

export function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ---------- Text ---------- */

/** Lowercase, strip Vietnamese diacritics, collapse spaces — for search & duplicate checks. */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/* ---------- Numbers ---------- */

/** Parses user-typed numbers ("1,5", "-3", " 12 "). Returns { value, valid }. Blank → null, valid. */
export function parseNumber(raw) {
  if (raw == null) return { value: null, valid: true };
  if (typeof raw === 'number') return { value: Number.isFinite(raw) ? raw : null, valid: Number.isFinite(raw) };
  const text = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (text === '') return { value: null, valid: true };
  if (!/^[-+]?\d*\.?\d+$/.test(text) && !/^[-+]?\d+\.?$/.test(text)) return { value: null, valid: false };
  const value = Number(text);
  return Number.isFinite(value) ? { value, valid: true } : { value: null, valid: false };
}

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });

export function formatNumber(value) {
  return value == null || value === '' ? '—' : numberFormat.format(Number(value));
}

export function formatPercent(ratio) {
  return ratio == null ? '—' : percentFormat.format(ratio);
}

/* ---------- Dates (report dates are local "YYYY-MM-DD" strings) ---------- */

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  return toISODate(parseISODate(iso)) === iso;
}

export function addDays(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function weekdayName(iso) { return WEEKDAYS[parseISODate(iso).getDay()]; }
export function weekdayShort(iso) { return WEEKDAYS_SHORT[parseISODate(iso).getDay()]; }

export function formatDate(iso) {
  if (!isValidISODate(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateLong(iso) {
  if (!isValidISODate(iso)) return 'Chưa chọn ngày';
  return `${weekdayName(iso)}, ${formatDate(iso)}`;
}

export function monthLabel(iso) {
  const d = parseISODate(iso);
  return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${formatTime(ms)} ${formatDate(toISODate(d))}`;
}

export function relativeDay(iso) {
  const diff = Math.round((parseISODate(iso) - parseISODate(todayISO())) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === -1) return 'Hôm qua';
  return null;
}

/* ---------- Collections ---------- */

export function byName(a, b) {
  return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
}

export function plural(count, word) {
  return `${formatNumber(count)} ${word}`;
}

export function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
