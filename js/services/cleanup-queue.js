// Durable queue of remote images to delete. Entries are written BEFORE the delete is attempted
// and removed only after it succeeds, so an interrupted cleanup resumes on the next launch.
// Safety: an image is never deleted while its owning report still references it.
import { STORAGE_KEYS } from '../config/app-config.js';
import { storage } from '../local/storage.js';
import { backend } from '../data/backend.js';
import { collectImageIds } from '../domain/schema.js';

let running = null;

function read() {
  const q = storage.get(STORAGE_KEYS.cleanupQueue, []);
  return Array.isArray(q) ? q : [];
}

function write(queue) {
  try { storage.set(STORAGE_KEYS.cleanupQueue, queue); } catch (err) { console.warn('cleanup queue not persisted', err); }
}

export const cleanupQueue = {
  enqueue(imageIds, reportId) {
    if (!imageIds.length) return;
    const queue = read();
    const known = new Set(queue.map((e) => e.imageId));
    imageIds.forEach((imageId) => { if (!known.has(imageId)) queue.push({ imageId, reportId, at: Date.now() }); });
    write(queue);
  },

  dequeue(imageIds) {
    const drop = new Set(imageIds);
    write(read().filter((e) => !drop.has(e.imageId)));
  },

  size: () => read().length,

  process() {
    if (running) return running;
    running = (async () => {
      const { images, reports } = backend();
      const referencedBy = new Map(); // reportId -> Set(imageIds) | null (missing report)
      const refsOf = async (reportId) => {
        if (!referencedBy.has(reportId)) {
          const doc = await reports.get(reportId);
          referencedBy.set(reportId, doc ? new Set(collectImageIds(doc)) : null);
        }
        return referencedBy.get(reportId);
      };

      let failed = 0;
      for (const entry of read()) {
        try {
          const meta = await images.getMeta(entry.imageId);
          if (!meta) { this.dequeue([entry.imageId]); continue; }
          const owner = meta.reportId || entry.reportId;
          const refs = owner ? await refsOf(owner) : null;
          if (refs && refs.has(entry.imageId)) {
            console.info(`Keep image ${entry.imageId}: still referenced by report ${owner}`);
          } else {
            await images.remove(entry.imageId);
          }
          this.dequeue([entry.imageId]);
        } catch (err) {
          failed += 1;
          console.warn('Image cleanup deferred', entry.imageId, err);
        }
      }
      return { failed };
    })().finally(() => { running = null; });
    return running;
  },
};
