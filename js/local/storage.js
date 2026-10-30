// Safe localStorage access. Every call tolerates blocked storage and quota errors.
import { AppError } from '../data/errors.js';

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  /** Throws AppError('storage-full') on quota errors so callers can surface it. */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      throw new AppError('storage-full', 'Bộ nhớ trình duyệt đã đầy, không lưu được trên máy.', err);
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
  getString(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setString(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
};
