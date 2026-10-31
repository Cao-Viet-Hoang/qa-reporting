// App chrome: a plain header with text tabs (desktop) and a standard tab bar docked at the bottom
// (mobile). Every tab always shows its label; logout lives in the header, away from the tabs.
import { h } from '../core/dom.js';
import { appState } from '../core/store.js';
import { router } from '../core/router.js';
import { icon } from './icons.js';

const NAV = [
  { key: 'reports', label: 'Báo cáo', icon: 'reports', path: '/reports', match: ['reports', 'report', 'edit', 'new'] },
  { key: 'stats', label: 'Thống kê', icon: 'stats', path: '/stats', match: ['stats'] },
  { key: 'catalog', label: 'Danh mục', icon: 'catalog', path: '/catalog', match: ['catalog'] },
];

function navBar(variant) {
  const items = NAV.map((item) => h('a', {
    class: 'nav__item',
    href: `#${item.path}`,
    'data-key': item.key,
  }, icon(item.icon, { size: variant === 'bottom' ? 22 : 18 }), h('span', { class: 'nav__label' }, item.label)));
  const el = h('nav', { class: `nav nav--${variant}`, 'aria-label': 'Điều hướng chính' }, items);
  return { el, items };
}

export function createShell({ onLogout }) {
  const top = navBar('top');
  const bottom = navBar('bottom');
  const statusPill = h('span', { class: 'conn', role: 'status' });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });

  const el = h('div', { class: 'shell' },
    h('a', { class: 'skip', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'Bỏ qua điều hướng'),
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/reports', 'aria-label': 'Báo cáo QC — trang chính' }, 'Báo cáo QC'),
      top.el,
      h('div', { class: 'topbar__end' },
        statusPill,
        h('button', { class: 'topbar__logout', type: 'button', title: 'Đăng xuất', onClick: onLogout },
          icon('logout', { size: 18 }), h('span', { class: 'topbar__logout-label' }, 'Đăng xuất')))),
    main,
    bottom.el,
  );

  function setRoute(routeName) {
    const item = NAV.find((n) => n.match.includes(routeName));
    const activeKey = item?.key || null;
    [top, bottom].forEach((nav) => nav.items.forEach((a) => {
      const on = a.dataset.key === activeKey;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }));
    el.dataset.route = routeName;
  }

  function paintStatus(state) {
    const offline = !state.online;
    statusPill.hidden = !offline && state.mode !== 'demo';
    statusPill.className = `conn ${offline ? 'conn--offline' : 'conn--demo'}`;
    statusPill.replaceChildren(...[
      offline && icon('cloudOff', { size: 14 }),
      h('span', null, offline ? 'Ngoại tuyến' : 'Bản demo'),
    ].filter(Boolean));
    statusPill.title = offline
      ? 'Mất kết nối — dữ liệu đang nhập vẫn được lưu trên máy'
      : 'Chế độ demo: dữ liệu mẫu chỉ lưu trên trình duyệt này';
  }
  const unsubscribe = appState.subscribe(paintStatus);
  paintStatus(appState.get());

  return {
    el,
    main,
    setRoute,
    setFocusMode(on) { el.classList.toggle('is-focus', on); },
    destroy() { unsubscribe(); },
    navigate: (path) => router.navigate(path),
  };
}
