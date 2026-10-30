// Catalog state: suppliers, NC causes, NC actions. Cached locally so forms still work offline.
import { STORAGE_KEYS } from '../config/app-config.js';
import { appState } from '../core/store.js';
import { byName, cleanName, normalizeText } from '../core/utils.js';
import { backend } from '../data/backend.js';
import { AppError, toAppError } from '../data/errors.js';
import { storage } from '../local/storage.js';
import { CATALOG_TYPES, SEED_SUPPLIERS } from '../domain/schema.js';

const TYPES = Object.keys(CATALOG_TYPES);

/** Deterministic seed ids: re-running seed (any device, any time) can never duplicate. */
export function seedIdFor(name) {
  const slug = normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `seed-${slug}`;
}

function setCatalog(type, items) {
  const catalogs = { ...appState.get().catalogs, [type]: [...items].sort(byName) };
  appState.set({ catalogs });
  storage.set(STORAGE_KEYS.catalogCache, catalogs);
}

function safeCache(catalogs) {
  try { storage.set(STORAGE_KEYS.catalogCache, catalogs); } catch { /* cache is optional */ }
}

export const catalogService = {
  async load({ force = false } = {}) {
    const state = appState.get();
    if (state.catalogStatus === 'ready' && !force) return state.catalogs;
    const cached = storage.get(STORAGE_KEYS.catalogCache);
    appState.set({
      catalogStatus: 'loading',
      catalogError: null,
      ...(cached && state.catalogStatus === 'idle' ? { catalogs: cached } : {}),
    });
    try {
      await backend().catalog.ensureSeed('suppliers', SEED_SUPPLIERS.map((name) => ({ id: seedIdFor(name), name })));
      const lists = await Promise.all(TYPES.map((t) => backend().catalog.list(t)));
      const catalogs = Object.fromEntries(TYPES.map((t, i) => [t, lists[i].sort(byName)]));
      appState.set({ catalogs, catalogStatus: 'ready' });
      safeCache(catalogs);
      return catalogs;
    } catch (err) {
      const appErr = toAppError(err);
      appState.set({ catalogStatus: 'error', catalogError: appErr.message });
      throw appErr;
    }
  },

  all(type) {
    return appState.get().catalogs[type] || [];
  },

  active(type) {
    return this.all(type).filter((x) => x.active);
  },

  findByName(type, name) {
    const key = normalizeText(name);
    return this.all(type).find((x) => normalizeText(x.name) === key) || null;
  },

  /** Adds an item, or re-activates a hidden item with the same name instead of duplicating it. */
  async add(type, rawName) {
    const name = cleanName(rawName);
    if (!name) throw new AppError('invalid-argument', 'Tên không được để trống.');
    const existing = this.findByName(type, name);
    if (existing && existing.active) return existing;
    try {
      if (existing) {
        await backend().catalog.update(type, existing.id, { active: true });
        const revived = { ...existing, active: true };
        setCatalog(type, this.all(type).map((x) => (x.id === existing.id ? revived : x)));
        return revived;
      }
      const item = await backend().catalog.add(type, name);
      setCatalog(type, [...this.all(type), item]);
      return item;
    } catch (err) {
      throw toAppError(err);
    }
  },

  async rename(type, id, rawName) {
    const name = cleanName(rawName);
    if (!name) throw new AppError('invalid-argument', 'Tên không được để trống.');
    const clash = this.findByName(type, name);
    if (clash && clash.id !== id) throw new AppError('invalid-argument', `"${clash.name}" đã có trong danh mục${clash.active ? '' : ' (đang ẩn)'}.`);
    try {
      await backend().catalog.update(type, id, { name });
      setCatalog(type, this.all(type).map((x) => (x.id === id ? { ...x, name } : x)));
    } catch (err) {
      throw toAppError(err);
    }
  },

  async setActive(type, id, active) {
    try {
      await backend().catalog.update(type, id, { active });
      setCatalog(type, this.all(type).map((x) => (x.id === id ? { ...x, active } : x)));
    } catch (err) {
      throw toAppError(err);
    }
  },
};
