/** Tiny observable store for app-wide state (connection, catalogs, online status). */
export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subscribers.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

export const appState = createStore({
  mode: null,              // 'firestore' | 'demo'
  online: navigator.onLine,
  catalogStatus: 'idle',   // 'idle' | 'loading' | 'ready' | 'error'
  catalogError: null,
  catalogs: { suppliers: [], ncCauses: [], ncActions: [] },
});
