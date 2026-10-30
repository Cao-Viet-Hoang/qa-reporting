// Report persistence orchestration. Order of operations guarantees:
//  1. new images are uploaded (each atomically) BEFORE the report references them;
//  2. old images are deleted only AFTER Firestore confirms the new report version;
//  3. images uploaded for a save that then fails are tracked in the draft (`uploadedUnsaved`)
//     and cleaned up if the draft is discarded — no silent orphans.
import { APP_CONFIG } from '../config/app-config.js';
import { withTimeout } from '../core/utils.js';
import { backend } from '../data/backend.js';
import { appError, toAppError } from '../data/errors.js';
import { appState } from '../core/store.js';
import { formToReport, collectImageIds } from '../domain/schema.js';
import { imageService } from './image-service.js';
import { cleanupQueue } from './cleanup-queue.js';
import { drafts } from '../local/drafts.js';

function assertOnline() {
  if (!navigator.onLine) throw appError('offline');
}

export const reportService = {
  newId: () => backend().reports.newId(),

  list(range) {
    return backend().reports.list(range);
  },

  get(id) {
    return backend().reports.get(id);
  },

  /**
   * ctx: { reportId, isNew, form, baseImageIds[], uploadedUnsaved[] }
   * Mutates ctx.uploadedUnsaved as images upload so the caller can persist it even on failure.
   */
  async save(ctx, status, { onPhase } = {}) {
    if (appState.get().mode === 'firestore') assertOnline();
    const currentIds = collectImageIds(ctx.form);

    try {
      onPhase?.('images');
      const uploaded = await imageService.uploadPending(currentIds, ctx.reportId, (done, total) => onPhase?.('images', { done, total }));
      ctx.uploadedUnsaved = [...new Set([...(ctx.uploadedUnsaved || []), ...uploaded])];

      onPhase?.('report');
      const data = { ...formToReport(ctx.form), status };
      const { updatedAt } = await withTimeout(
        backend().reports.save(ctx.reportId, data, { isNew: ctx.isNew }),
        APP_CONFIG.saveTimeoutMs,
        () => appError('timeout'),
      );

      // Confirmed by the server — now it is safe to clean up images no longer referenced.
      const keep = new Set(currentIds);
      const obsolete = [...new Set([...(ctx.baseImageIds || []), ...(ctx.uploadedUnsaved || [])])].filter((id) => !keep.has(id));
      ctx.baseImageIds = currentIds;
      ctx.uploadedUnsaved = [];
      ctx.isNew = false;
      if (obsolete.length) imageService.removeRemote(obsolete, ctx.reportId).catch((err) => console.warn(err));

      return { updatedAt, data };
    } catch (err) {
      throw toAppError(err);
    }
  },

  /** Deletes a report then its images. The cleanup queue re-checks references before each delete. */
  async remove(report) {
    if (appState.get().mode === 'firestore') assertOnline();
    try {
      const imageIds = collectImageIds(report);
      await backend().reports.remove(report.id);
      drafts.remove(report.id);
      if (imageIds.length) {
        cleanupQueue.enqueue(imageIds, report.id);
        cleanupQueue.process().catch((err) => console.warn(err));
      }
    } catch (err) {
      throw toAppError(err);
    }
  },

  /** Discards a local draft: pending local images are dropped, unsaved uploads are cleaned remotely. */
  async discardDraft(draft) {
    if (!draft) return;
    const base = new Set(draft.baseImageIds || []);
    const localIds = collectImageIds(draft.form).filter((id) => !base.has(id) && imageService.isPending(id));
    await Promise.all(localIds.map((id) => imageService.discardLocal(id)));
    const orphans = (draft.uploadedUnsaved || []).filter((id) => !base.has(id));
    drafts.remove(draft.reportId);
    if (orphans.length) imageService.removeRemote(orphans, draft.reportId).catch((err) => console.warn(err));
  },
};
