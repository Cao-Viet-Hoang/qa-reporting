// App chrome: compact header with an expanding-pill navigation (desktop) and the same nav docked
// at the bottom for one-handed use (mobile). Only the active item shows its label.
import { h } from '../core/dom.js';
import { appState } from '../core/store.js';
import { router } from '../core/router.js';
import { icon } from './icons.js';

const NAV = [
  { key: 'reports', label: 'Báo cáo', icon: 'reports', path: '/reports', match: ['reports', 'report', 'new'] },
  { key: 'stats', label: 'Thống kê', icon: 'stats', path: '/stats', match: ['stats'] },
  { key: 'catalog', label: 'Danh mục', icon: 'catalog', path: '/catalog', match: ['catalog'] },
];

function navBar(variant, onLogout) {
  const items = NAV.map((item) => h('a', {
    class: 'nav__item',
    href: `#${item.path}`,
    'data-key': item.key,
    'aria-label': item.label,
  }, icon(item.icon, { size: 19 }), h('span', { class: 'nav__label' }, item.label)));
  const logout = h('button', { class: 'nav__item nav__item--quiet', type: 'button', 'aria-label': 'Đăng xuất', title: 'Đăng xuất', onClick: onLogout },
    icon('logout', { size: 19 }), h('span', { class: 'nav__label' }, 'Thoát'));
  const indicator = h('span', { class: 'nav__indicator', 'aria-hidden': 'true' });
  const el = h('nav', { class: `nav nav--${variant}`, 'aria-label': 'Điều hướng chính' },
    h('div', { class: 'nav__track' }, indicator, items, variant === 'bottom' && logout));
  return { el, items, indicator, logout };
}

export function createShell({ onLogout }) {
  const top = navBar('top', onLogout);
  const bottom = navBar('bottom', onLogout);
  const statusPill = h('span', { class: 'conn', role: 'status' });
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });

  const el = h('div', { class: 'shell' },
    h('a', { class: 'skip', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'Bỏ qua điều hướng'),
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/reports', 'aria-label': 'Báo cáo QC — trang chính' },
        h('span', { class: 'brand__mark' }, icon('check', { size: 15 })),
        h('span', { class: 'brand__name' }, 'QC', h('span', { class: 'brand__sub' }, 'Báo cáo ngày'))),
      top.el,
      h('div', { class: 'topbar__end' },
        statusPill,
        h('button', { class: 'icon-btn topbar__logout', type: 'button', 'aria-label': 'Đăng xuất', title: 'Đăng xuất', onClick: onLogout }, icon('logout', { size: 18 })))),
    main,
    bottom.el,
  );

  function moveIndicator(nav, activeEl) {
    if (!activeEl) { nav.indicator.style.opacity = '0'; return; }
    requestAnimationFrame(() => {
      nav.indicator.style.opacity = '1';
      nav.indicator.style.width = `${activeEl.offsetWidth}px`;
      nav.indicator.style.transform = `translateX(${activeEl.offsetLeft}px)`;
    });
  }

  let activeKey = null;
  function setRoute(routeName) {
    const item = NAV.find((n) => n.match.includes(routeName));
    activeKey = item?.key || null;
    [top, bottom].forEach((nav) => {
      let activeEl = null;
      nav.items.forEach((a) => {
        const on = a.dataset.key === activeKey;
        a.classList.toggle('is-active', on);
        if (on) { a.setAttribute('aria-current', 'page'); activeEl = a; } else a.removeAttribute('aria-current');
      });
      // Label width changes after the class toggles; measure after layout and after the width transition.
      moveIndicator(nav, activeEl);
      setTimeout(() => moveIndicator(nav, activeEl), 260);
    });
    el.dataset.route = routeName;
  }

  const onResize = () => setRoute(el.dataset.route || 'reports');
  window.addEventListener('resize', onResize);
  document.fonts?.ready?.then(onResize);

  function paintStatus(state) {
    const offline = !state.online;
    statusPill.hidden = !offline && state.mode !== 'demo';
    statusPill.className = `conn ${offline ? 'conn--offline' : 'conn--demo'}`;
    statusPill.replaceChildren(
      icon(offline ? 'cloudOff' : 'sparkle', { size: 14 }),
      h('span', null, offline ? 'Ngoại tuyến' : 'Demo'),
    );
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
    destroy() { unsubscribe(); window.removeEventListener('resize', onResize); },
    navigate: (path) => router.navigate(path),
  };
}
