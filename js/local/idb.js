// Small promise wrapper over IndexedDB, with an in-memory fallback (private browsing, blocked storage).

const DB_NAME = 'qc-app';
const DB_VERSION = 1;
export const STORES = { pending: 'pendingImages', cache: 'imageCache', demo: 'demoImages' };

let dbPromise = null;
const memory = new Map(Object.values(STORES).map((s) => [s, new Map()]));
let useMemory = false;

function open() {
  if (useMemory) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { useMemory = true; resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.values(STORES).forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.warn('IndexedDB unavailable, using memory', req.error); useMemory = true; resolve(null); };
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => {
    if (!db) return fn(null, memory.get(store));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      Promise.resolve(fn(os)).then((r) => { result = r; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const idb = {
  get(store, id) {
    return run(store, 'readonly', (os, mem) => (os ? req2p(os.get(id)) : mem.get(id)));
  },
  put(store, value) {
    return run(store, 'readwrite', (os, mem) => (os ? req2p(os.put(value)) : mem.set(value.id, value)));
  },
  delete(store, id) {
    return run(store, 'readwrite', (os, mem) => (os ? req2p(os.delete(id)) : mem.delete(id)));
  },
  all(store) {
    return run(store, 'readonly', (os, mem) => (os ? req2p(os.getAll()) : [...mem.values()]));
  },
  clear(store) {
    return run(store, 'readwrite', (os, mem) => (os ? req2p(os.clear()) : mem.clear()));
  },
};
