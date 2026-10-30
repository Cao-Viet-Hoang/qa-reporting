// Hash router: #/reports, #/report/<id>, #/new, #/stats, #/catalog

const ROUTES = [
  { name: 'reports', pattern: /^\/reports\/?$/ },
  { name: 'new', pattern: /^\/new\/?$/ },
  { name: 'report', pattern: /^\/report\/([A-Za-z0-9_-]+)\/?$/, params: ['id'] },
  { name: 'stats', pattern: /^\/stats\/?$/ },
  { name: 'catalog', pattern: /^\/catalog\/?$/ },
];

export function parseHash(hash = location.hash) {
  const path = hash.replace(/^#/, '') || '/reports';
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      const params = {};
      (route.params || []).forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
      return { name: route.name, params, path };
    }
  }
  return { name: 'reports', params: {}, path: '/reports' };
}

let listener = null;

export const router = {
  start(onRoute) {
    this.stop();
    listener = () => onRoute(parseHash());
    window.addEventListener('hashchange', listener);
    listener();
  },
  stop() {
    if (listener) window.removeEventListener('hashchange', listener);
    listener = null;
  },
  /** Rewrites the URL without re-running the route (e.g. #/new → #/report/<id>). */
  replaceSilently(path) {
    history.replaceState(null, '', `#${path}`);
  },
  navigate(path, { replace = false } = {}) {
    const target = `#${path}`;
    if (replace) {
      history.replaceState(null, '', target);
      listener?.();
    } else if (location.hash === target) {
      listener?.();
    } else {
      location.hash = target;
    }
  },
};
