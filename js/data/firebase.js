// Loads the Firebase modular SDK from the official CDN and initializes Firestore once per access key.
import { APP_CONFIG } from '../config/app-config.js';
import { firebaseConfig } from '../config/firebase-config.js';

const CDN = `https://www.gstatic.com/firebasejs/${APP_CONFIG.firebaseSdkVersion}`;

let sdkPromise = null;
let current = null; // { app, db, fs, apiKey }

export function loadFirebaseSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]).then(([app, fs]) => ({ app, fs }))
      .catch((err) => { sdkPromise = null; throw err; });
  }
  return sdkPromise;
}

export async function initFirestore(apiKey) {
  if (current && current.apiKey === apiKey) return current;
  const { app: appSdk, fs } = await loadFirebaseSdk();
  if (current) await appSdk.deleteApp(current.app).catch(() => {});
  const app = appSdk.initializeApp({ ...firebaseConfig, apiKey }, `qc-${Date.now()}`);
  const db = fs.getFirestore(app);
  current = { app, db, fs, apiKey };
  return current;
}

export async function disposeFirestore() {
  if (!current) return;
  const { app: appSdk } = await loadFirebaseSdk();
  await appSdk.deleteApp(current.app).catch(() => {});
  current = null;
}
