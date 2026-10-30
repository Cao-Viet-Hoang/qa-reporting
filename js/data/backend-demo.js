// Local-only backend for previewing the UI without a Firebase project.
// Same interface and semantics as the Firestore backend; data never leaves this browser.
import { uid } from '../core/utils.js';
import { idb, STORES } from '../local/idb.js';
import { buildDemoDatabase } from '../demo/demo-data.js';

const DB_KEY = 'qc.demo.db.v1';
const latency = (min = 120, max = 380) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to fresh db */ }
  const db = buildDemoDatabase();
  persist(db);
  return db;
}

function persist(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

const clone = (v) => JSON.parse(JSON.stringify(v));

export function resetDemoDatabase() {
  localStorage.removeItem(DB_KEY);
  return idb.clear(STORES.demo);
}

export function createDemoBackend() {
  let db = load();
  const commit = () => persist(db);

  return {
    kind: 'demo',

    catalog: {
      async list(type) {
        await latency();
        return clone(db[type] || []);
      },
      async add(type, name) {
        await latency();
        const item = { id: uid(), name, active: true };
        db[type] = [...(db[type] || []), item];
        commit();
        return clone(item);
      },
      async update(type, id, patch) {
        await latency();
        const item = (db[type] || []).find((x) => x.id === id);
        if (!item) throw Object.assign(new Error('not found'), { code: 'not-found' });
        Object.assign(item, patch);
        commit();
      },
      async ensureSeed(type, entries) {
        const list = db[type] || (db[type] = []);
        let created = 0;
        entries.forEach((e) => {
          if (!list.some((x) => x.id === e.id)) { list.push({ id: e.id, name: e.name, active: true }); created += 1; }
        });
        if (created) commit();
        return created;
      },
    },

    reports: {
      newId: () => uid(),
      async list({ from, to } = {}) {
        await latency(250, 600);
        return clone(Object.values(db.reports))
          .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
          .sort((a, b) => (b.date === a.date ? (b.updatedAt || 0) - (a.updatedAt || 0) : b.date.localeCompare(a.date)));
      },
      async get(id) {
        await latency();
        return db.reports[id] ? clone(db.reports[id]) : null;
      },
      async save(id, data, { isNew }) {
        await latency(300, 700);
        const now = Date.now();
        const prev = db.reports[id];
        db.reports[id] = { ...clone(data), id, createdAt: isNew || !prev ? now : prev.createdAt, updatedAt: now };
        commit();
        return { updatedAt: now };
      },
      async remove(id) {
        await latency();
        delete db.reports[id];
        commit();
      },
    },

    images: {
      async put(imageId, chunks, reportId) {
        await latency(300, 900);
        await idb.put(STORES.demo, { id: imageId, chunks, chunkCount: chunks.length, reportId });
      },
      async getMeta(imageId) {
        const rec = await idb.get(STORES.demo, imageId);
        return rec ? { chunkCount: rec.chunkCount, reportId: rec.reportId } : null;
      },
      async getData(imageId) {
        await latency(300, 800);
        const rec = await idb.get(STORES.demo, imageId);
        if (!rec) throw Object.assign(new Error('not found'), { code: 'not-found' });
        return rec.chunks.join('');
      },
      async remove(imageId) {
        await latency();
        await idb.delete(STORES.demo, imageId);
      },
    },
  };
}
