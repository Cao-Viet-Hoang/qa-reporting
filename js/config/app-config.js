export const APP_CONFIG = {
  firebaseSdkVersion: '10.12.2',
  image: {
    maxDimension: 1280,
    quality: 0.7,
    fallbackQuality: 0.55,
    chunkSize: 900_000,          // chars of base64 per chunk doc (PLAN.md §6: < 1 MiB/document)
    maxBase64Length: 7_000_000,  // keeps one image (meta + chunks) well under the 10 MiB batch request limit
  },
  autosaveDelayMs: 700,
  saveTimeoutMs: 25_000,
  imageCacheLimit: 80,
  defaultRangeDays: 30,
};

export const STORAGE_KEYS = {
  apiKey: 'qc.accessKey',
  mode: 'qc.mode',
  reporter: 'qc.reporter',
  draftIndex: 'qc.drafts.v1',
  draftPrefix: 'qc.draft.v1.',
  cleanupQueue: 'qc.cleanupQueue.v1',
  catalogCache: 'qc.catalogCache.v1',
  ui: 'qc.ui.v1',
};
