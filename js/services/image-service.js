// Image lifecycle:
//   pick → compress → IndexedDB "pending" (local, survives reload)  → upload on report save → IndexedDB "cache"
// Remote images are fetched only when the user asks to view them (lazy), then cached locally.
import { APP_CONFIG } from '../config/app-config.js';
import { uid } from '../core/utils.js';
import { backend } from '../data/backend.js';
import { idb, STORES } from '../local/idb.js';
import { compressImage, splitChunks, toDataUrl } from '../images/compress.js';
import { cleanupQueue } from './cleanup-queue.js';

const inflight = new Map(); // imageId -> Promise<base64>
const pendingIds = new Set();
let pendingLoaded = null;

function ensurePendingIndex() {
  if (!pendingLoaded) {
    pendingLoaded = idb.all(STORES.pending)
      .then((rows) => rows.forEach((r) => pendingIds.add(r.id)))
      .catch((err) => console.warn('pending index', err));
  }
  return pendingLoaded;
}

async function putCache(id, base64) {
  await idb.put(STORES.cache, { id, base64, at: Date.now() });
  const all = await idb.all(STORES.cache);
  if (all.length > APP_CONFIG.imageCacheLimit) {
    all.sort((a, b) => a.at - b.at)
      .slice(0, all.length - APP_CONFIG.imageCacheLimit)
      .forEach((r) => idb.delete(STORES.cache, r.id));
  }
}

export const imageService = {
  ready: ensurePendingIndex,

  /** Compresses and stores locally. Returns the new imageId. Not uploaded until the report is saved. */
  async addFromFile(file, reportId) {
    const { base64 } = await compressImage(file);
    const id = uid();
    await idb.put(STORES.pending, { id, base64, reportId, at: Date.now() });
    pendingIds.add(id);
    return id;
  },

  isPending(id) {
    return pendingIds.has(id);
  },

  /** Local-only lookup (pending or cache) — never touches the network. */
  async getLocal(id) {
    const pending = await idb.get(STORES.pending, id);
    if (pending) return pending.base64;
    const cached = await idb.get(STORES.cache, id);
    return cached ? cached.base64 : null;
  },

  /** Full load: local first, then remote (lazy). Returns a data URL. */
  async load(id) {
    const local = await this.getLocal(id);
    if (local) return toDataUrl(local);
    if (!inflight.has(id)) {
      const p = backend().images.getData(id)
        .then(async (base64) => { await putCache(id, base64).catch(() => {}); return base64; })
        .finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    return toDataUrl(await inflight.get(id));
  },

  /**
   * Uploads every pending image in `ids`. Each image is one atomic batch (meta + chunks).
   * After upload the local copy moves to the cache. Returns ids actually uploaded.
   */
  async uploadPending(ids, reportId, onProgress) {
    await ensurePendingIndex();
    const todo = ids.filter((id) => pendingIds.has(id));
    const uploaded = [];
    for (let i = 0; i < todo.length; i += 1) {
      const id = todo[i];
      onProgress?.(i, todo.length);
      const rec = await idb.get(STORES.pending, id);
      if (!rec) { pendingIds.delete(id); continue; }
      await backend().images.put(id, splitChunks(rec.base64), reportId);
      await putCache(id, rec.base64).catch(() => {});
      await idb.delete(STORES.pending, id);
      pendingIds.delete(id);
      uploaded.push(id);
    }
    onProgress?.(todo.length, todo.length);
    return uploaded;
  },

  /** Drops a never-uploaded local image. */
  async discardLocal(id) {
    pendingIds.delete(id);
    await idb.delete(STORES.pending, id).catch(() => {});
  },

  /** Drops local pending images whose draft no longer exists (older than a day, to avoid racing an open form). */
  async gcPending(liveReportIds) {
    const live = new Set(liveReportIds);
    const cutoff = Date.now() - 24 * 3600_000;
    const rows = await idb.all(STORES.pending);
    await Promise.all(rows
      .filter((r) => !live.has(r.reportId) && r.at < cutoff)
      .map((r) => this.discardLocal(r.id)));
  },

  /** Schedules remote deletion (durable queue) and drops local copies. */
  async removeRemote(ids, reportId) {
    if (!ids.length) return;
    cleanupQueue.enqueue(ids, reportId);
    await Promise.all(ids.map((id) => idb.delete(STORES.cache, id).catch(() => {})));
    return cleanupQueue.process();
  },
};
