// Access gate (PLAN.md §1): the "password" is the Firebase API key, remembered in localStorage.
// This only blocks casual users. It is NOT authentication and does NOT protect data.
import { STORAGE_KEYS } from '../config/app-config.js';
import { isFirebaseConfigured } from '../config/firebase-config.js';
import { appState } from '../core/store.js';
import { withTimeout } from '../core/utils.js';
import { setBackend } from '../data/backend.js';
import { createFirestoreBackend } from '../data/backend-firestore.js';
import { createDemoBackend } from '../data/backend-demo.js';
import { initFirestore, disposeFirestore } from '../data/firebase.js';
import { appError, toAppError } from '../data/errors.js';
import { storage } from '../local/storage.js';

/** Maps the errors of a probe read to "wrong key" vs other problems. */
function classifyProbeError(err) {
  const code = String(err?.code || '').replace(/^firestore\//, '');
  const msg = String(err?.message || '');
  if (/api[- ]?key|API_KEY_INVALID|invalid-api-key/i.test(msg) || code === 'invalid-api-key') return appError('invalid-key');
  if (code === 'invalid-argument' && /key/i.test(msg)) return appError('invalid-key');
  if (code === 'not-found' || /database .* does not exist|NOT_FOUND/i.test(msg)) return appError('project-not-found');
  return toAppError(err);
}

/**
 * With open Firestore rules, Firestore accepts ANY key value, so a Firestore read cannot tell a wrong
 * password from the right one. Google's Identity Toolkit does validate the key itself:
 * an invalid key → "API key not valid"; a valid key → some other answer (e.g. CONFIGURATION_NOT_FOUND
 * when Authentication is not enabled). Only the explicit invalid-key answer counts as a wrong password.
 */
async function verifyApiKey(apiKey) {
  let body;
  try {
    const res = await withTimeout(
      fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'probe@example.com', continueUri: location.origin }),
      }),
      15000,
      () => appError('timeout'),
    );
    body = await res.json().catch(() => ({}));
  } catch (err) {
    throw toAppError(err);
  }
  const error = body?.error;
  const text = `${error?.message || ''} ${JSON.stringify(error?.details || '')}`;
  if (/API key not valid|API_KEY_INVALID/i.test(text)) throw appError('invalid-key');
}

async function connectFirestore(apiKey) {
  if (!isFirebaseConfigured()) throw appError('config-missing');
  if (!navigator.onLine) throw appError('offline');
  await verifyApiKey(apiKey);
  try {
    const { db, fs } = await initFirestore(apiKey);
    // Probe: one tiny read to confirm the database exists and the rules allow access.
    await withTimeout(
      fs.getDocsFromServer(fs.query(fs.collection(db, 'suppliers'), fs.limit(1))),
      15000,
      () => appError('timeout'),
    );
    setBackend(createFirestoreBackend({ db, fs }));
  } catch (err) {
    await disposeFirestore();
    throw classifyProbeError(err);
  }
}

export const accessService = {
  isConfigured: isFirebaseConfigured,

  remembered() {
    return { apiKey: storage.getString(STORAGE_KEYS.apiKey), mode: storage.getString(STORAGE_KEYS.mode) };
  },

  async unlock(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) throw appError('invalid-key');
    await connectFirestore(key);
    storage.setString(STORAGE_KEYS.apiKey, key);
    storage.setString(STORAGE_KEYS.mode, 'firestore');
    appState.set({ mode: 'firestore' });
  },

  /** Restores a remembered session without a network probe (works offline; errors surface on first request). */
  async resume() {
    const { apiKey, mode } = this.remembered();
    if (mode === 'demo') return this.enterDemo();
    if (!apiKey || !isFirebaseConfigured()) return false;
    const { db, fs } = await initFirestore(apiKey);
    setBackend(createFirestoreBackend({ db, fs }));
    appState.set({ mode: 'firestore' });
    return true;
  },

  enterDemo() {
    setBackend(createDemoBackend());
    storage.setString(STORAGE_KEYS.mode, 'demo');
    appState.set({ mode: 'demo' });
    return true;
  },

  async logout() {
    storage.remove(STORAGE_KEYS.apiKey);
    storage.remove(STORAGE_KEYS.mode);
    storage.remove(STORAGE_KEYS.catalogCache);
    await disposeFirestore();
    setBackend(null);
    appState.set({ mode: null, catalogStatus: 'idle', catalogs: { suppliers: [], ncCauses: [] } });
  },
};
