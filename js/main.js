import { appState } from './core/store.js';
import { router } from './core/router.js';
import { clear } from './core/dom.js';
import { accessService } from './services/access-service.js';
import { catalogService } from './services/catalog-service.js';
import { cleanupQueue } from './services/cleanup-queue.js';
import { imageService } from './services/image-service.js';
import { drafts } from './local/drafts.js';
import { createShell } from './ui/shell.js';
import { confirmDialog } from './ui/dialog.js';
import { toast } from './ui/toast.js';
import { renderLogin } from './screens/login-screen.js';
import { mountReports } from './screens/reports-screen.js';
import { mountReportForm } from './screens/report-form/report-form-screen.js';
import { mountReportView } from './screens/report-view-screen.js';
import { mountStats } from './screens/stats-screen.js';
import { mountCatalog } from './screens/catalog-screen.js';

const appEl = document.getElementById('app');
const SCREENS = { reports: mountReports, new: mountReportForm, report: mountReportView, edit: mountReportForm, stats: mountStats, catalog: mountCatalog };

let shell = null;
let currentScreen = null;
let routeToken = 0;

window.addEventListener('online', () => {
  appState.set({ online: true });
  if (shell) cleanupQueue.process().catch(() => {});
});
window.addEventListener('offline', () => appState.set({ online: false }));
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled', e.reason);
  toast(e.reason?.message || 'Có lỗi không mong muốn.', { type: 'error' });
});

function showLogin() {
  router.stop();
  shell?.destroy();
  shell = null;
  clear(appEl).append(renderLogin({ onUnlocked: startApp }));
}

async function logout() {
  const unsynced = drafts.list().length;
  const ok = await confirmDialog({
    title: 'Đăng xuất?',
    message: unsynced
      ? `Có ${unsynced} bản nháp chưa đồng bộ trên máy này. Chúng vẫn được giữ lại và sẽ hiện khi bạn truy cập lại.`
      : 'Mật khẩu đã ghi nhớ trên máy này sẽ bị xoá.',
    confirmLabel: 'Đăng xuất',
  });
  if (!ok) return;
  currentScreen?.unmount?.();
  currentScreen = null;
  await accessService.logout();
  history.replaceState(null, '', location.pathname + location.search);
  showLogin();
}

function startApp() {
  shell = createShell({ onLogout: logout });
  clear(appEl).append(shell.el);

  catalogService.load().catch((err) => toast(`Danh mục: ${err.message}`, {
    type: 'error',
    action: { label: 'Thử lại', onClick: () => catalogService.load({ force: true }).catch(() => {}) },
  }));
  if (navigator.onLine) cleanupQueue.process().catch(() => {});
  imageService.gcPending(drafts.list().map((d) => d.reportId)).catch(() => {});

  router.start(handleRoute);
}

async function handleRoute(route) {
  const token = ++routeToken;
  if (currentScreen?.unmount) await currentScreen.unmount();
  if (token !== routeToken) return;
  currentScreen = null;
  shell.setRoute(route.name);
  shell.setFocusMode(route.name === 'edit' || route.name === 'new');
  clear(shell.main);
  window.scrollTo(0, 0);
  const mount = SCREENS[route.name] || mountReports;
  currentScreen = mount(shell.main, route.params, { route, shell });
}

async function boot() {
  await imageService.ready();
  try {
    if (await accessService.resume()) { startApp(); return; }
  } catch (err) {
    console.warn('Resume failed', err);
  }
  showLogin();
}

boot();
