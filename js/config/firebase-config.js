// Firebase web app configuration.
// Fill in from: Firebase Console → Project settings → General → Your apps → Web app → SDK setup (Config).
//
// `apiKey` is intentionally NOT stored here. Per PLAN.md §1 the API key is typed on the access screen
// and remembered in localStorage. The API key is NOT a secret and the access screen is NOT data security —
// see README.md "Bảo mật & rủi ro".
export const firebaseConfig = {
  authDomain: 'qc-reporting-1e0a0.firebaseapp.com',
  projectId: 'qc-reporting-1e0a0',
  storageBucket: 'qc-reporting-1e0a0.firebasestorage.app',
  messagingSenderId: '247526786687',
  appId: '1:247526786687:web:8230d54c2c53763729e14a',
};

export function isFirebaseConfigured() {
  const id = firebaseConfig.projectId;
  return Boolean(id) && !id.startsWith('YOUR_');
}
