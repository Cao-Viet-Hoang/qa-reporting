// Local drafts: one localStorage entry per report (keyed by reportId), plus a small index.
// A draft holds unsynced form state; it is removed only after Firestore confirms the save.
import { STORAGE_KEYS } from '../config/app-config.js';
import { storage } from './storage.js';

const keyOf = (reportId) => `${STORAGE_KEYS.draftPrefix}${reportId}`;

function readIndex() {
  const index = storage.get(STORAGE_KEYS.draftIndex, {});
  return index && typeof index === 'object' ? index : {};
}

export const drafts = {
  /**
   * draft = { reportId, isNew, form, baseImageIds[], knownRemoteIds[], baseUpdatedAt, savedAt }
   */
  get(reportId) {
    return storage.get(keyOf(reportId));
  },

  save(draft) {
    const savedAt = Date.now();
    const record = { ...draft, savedAt };
    storage.set(keyOf(draft.reportId), record);
    const index = readIndex();
    index[draft.reportId] = {
      reportId: draft.reportId,
      isNew: draft.isNew,
      date: draft.form.date,
      reporter: draft.form.reporter,
      status: draft.form.status,
      savedAt,
    };
    storage.set(STORAGE_KEYS.draftIndex, index);
    return savedAt;
  },

  remove(reportId) {
    storage.remove(keyOf(reportId));
    const index = readIndex();
    if (index[reportId]) {
      delete index[reportId];
      try { storage.set(STORAGE_KEYS.draftIndex, index); } catch { /* index self-heals in list() */ }
    }
  },

  /** Index entries, newest first. Drops index entries whose draft body is missing. */
  list() {
    const index = readIndex();
    const entries = Object.values(index).filter((e) => storage.getString(keyOf(e.reportId)) != null);
    return entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },
};
