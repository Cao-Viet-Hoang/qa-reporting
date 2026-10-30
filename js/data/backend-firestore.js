import { appError } from './errors.js';

const MAX_BATCH_OPS = 500;

const toMillis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : (typeof ts === 'number' ? ts : null));

function normalizeReport(snap) {
  const data = snap.data();
  return { ...data, id: snap.id, createdAt: toMillis(data.createdAt), updatedAt: toMillis(data.updatedAt) };
}

export function createFirestoreBackend({ db, fs }) {
  const {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
    query, where, orderBy, writeBatch, runTransaction, serverTimestamp,
  } = fs;

  const chunkCol = (imageId) => collection(db, 'images', imageId, 'chunks');

  return {
    kind: 'firestore',

    catalog: {
      async list(type) {
        const snap = await getDocs(collection(db, type));
        return snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? ''), active: d.data().active !== false }));
      },
      async add(type, name) {
        const ref = await addDoc(collection(db, type), { name, active: true });
        return { id: ref.id, name, active: true };
      },
      async update(type, id, patch) {
        await updateDoc(doc(db, type, id), patch);
      },
      // Deterministic ids + transaction → concurrent first launches can never create duplicates.
      async ensureSeed(type, entries) {
        return runTransaction(db, async (tx) => {
          const refs = entries.map((e) => doc(db, type, e.id));
          const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
          let created = 0;
          snaps.forEach((snap, i) => {
            if (!snap.exists()) {
              tx.set(refs[i], { name: entries[i].name, active: true });
              created += 1;
            }
          });
          return created;
        });
      },
    },

    reports: {
      newId() {
        return doc(collection(db, 'reports')).id;
      },
      async list({ from, to } = {}) {
        const clauses = [];
        if (from) clauses.push(where('date', '>=', from));
        if (to) clauses.push(where('date', '<=', to));
        const snap = await getDocs(query(collection(db, 'reports'), ...clauses, orderBy('date', 'desc')));
        return snap.docs.map(normalizeReport)
          .sort((a, b) => (b.date === a.date ? (b.updatedAt || 0) - (a.updatedAt || 0) : b.date.localeCompare(a.date)));
      },
      async get(id) {
        const snap = await getDoc(doc(db, 'reports', id));
        return snap.exists() ? normalizeReport(snap) : null;
      },
      async save(id, data, { isNew }) {
        const payload = { ...data, updatedAt: serverTimestamp() };
        if (isNew) payload.createdAt = serverTimestamp();
        // merge:true keeps createdAt on updates; arrays are replaced wholesale.
        await setDoc(doc(db, 'reports', id), payload, { merge: true });
        return { updatedAt: Date.now() };
      },
      async remove(id) {
        await deleteDoc(doc(db, 'reports', id));
      },
    },

    images: {
      async put(imageId, chunks, reportId) {
        if (chunks.length + 1 > MAX_BATCH_OPS) throw appError('image-too-large');
        const batch = writeBatch(db);
        batch.set(doc(db, 'images', imageId), { chunkCount: chunks.length, reportId, createdAt: serverTimestamp() });
        chunks.forEach((data, n) => batch.set(doc(chunkCol(imageId), String(n)), { data, n }));
        await batch.commit();
      },
      async getMeta(imageId) {
        const snap = await getDoc(doc(db, 'images', imageId));
        return snap.exists() ? { chunkCount: snap.data().chunkCount, reportId: snap.data().reportId || null } : null;
      },
      async getData(imageId) {
        const [meta, snap] = await Promise.all([this.getMeta(imageId), getDocs(chunkCol(imageId))]);
        if (!meta) throw appError('not-found');
        const parts = snap.docs
          .map((d) => ({ n: Number(d.id), data: d.data().data }))
          .sort((a, b) => a.n - b.n);
        if (parts.length !== meta.chunkCount || parts.some((p, i) => p.n !== i)) {
          throw new Error(`Ảnh thiếu dữ liệu (${parts.length}/${meta.chunkCount} phần)`);
        }
        return parts.map((p) => p.data).join('');
      },
      // Subcollections are not removed with their parent, so chunks are listed and deleted explicitly.
      async remove(imageId) {
        const snap = await getDocs(chunkCol(imageId));
        const refs = [...snap.docs.map((d) => d.ref), doc(db, 'images', imageId)];
        for (let i = 0; i < refs.length; i += MAX_BATCH_OPS) {
          const batch = writeBatch(db);
          refs.slice(i, i + MAX_BATCH_OPS).forEach((ref) => batch.delete(ref));
          await batch.commit();
        }
      },
    },
  };
}
