// SVG charts for the statistics screen. Sized to their container (re-render on resize),
// colored only through CSS classes so light/dark tokens apply. Every value is also reachable
// without hovering: the screen renders a table / ranked list next to each chart.
import { h } from '../core/dom.js';
import { formatNumber, formatPercent, formatDate, weekdayShort } from '../core/utils.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c) el.append(c);
  return el;
}

/** Bar path: 4px rounded data-end, square at the baseline. */
function barPath(x, y, w, hgt) {
  if (hgt <= 0) return '';
  const r = Math.min(4, w / 2, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

function niceMax(v) {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const step = 10 ** Math.floor(Math.log10(v));
  const m = [1, 2, 2.5, 5, 10].find((f) => f * step >= v);
  return m * step;
}

/** Shared chart frame: wrapper, sizing, tooltip, keyboard focus index. */
function createFrame({ label, onRender }) {
  const tip = h('div', { class: 'chart__tip', role: 'presentation', hidden: true });
  const host = h('div', { class: 'chart__svg' });
  const el = h('div', { class: 'chart', tabindex: '0', role: 'img', 'aria-label': label }, host, tip);
  let width = 0;
  const ro = new ResizeObserver(([entry]) => {
    const w = Math.floor(entry.contentRect.width);
    if (w && w !== width) { width = w; host.replaceChildren(onRender(w)); }
  });
  ro.observe(el);
  return {
    el,
    rerender() { if (width) host.replaceChildren(onRender(width)); },
    showTip(x, y, content) {
      tip.replaceChildren(...content);
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = x + 14 + tw > width ? Math.max(0, x - 14 - tw) : x + 14;
      tip.style.transform = `translate(${left}px, ${Math.max(0, y)}px)`;
    },
    hideTip() { tip.hidden = true; },
    destroy() { ro.disconnect(); },
  };
}

function tipRow(keyClass, label, value, extra) {
  return h('div', { class: 'chart__tip-row' },
    h('span', { class: `chart__key ${keyClass}` }),
    h('b', { class: 'num' }, value),
    h('span', { class: 'chart__tip-label' }, label, extra && h('span', { class: 'num' }, ` · ${extra}`)));
}

/* ---------------- Trend: acceptance rate (line) over NC count (columns), shared time axis ---------------- */

export function bucketLabel(bucket, unit, { long = false } = {}) {
  const [, m, d] = bucket.key.split('-');
  if (unit === 'month') return long ? `Tháng ${Number(m)}, ${bucket.key.slice(0, 4)}` : `${m}/${bucket.key.slice(2, 4)}`;
  if (unit === 'week') return long ? `Tuần ${formatDate(bucket.key).slice(0, 5)} – ${formatDate(bucket.end).slice(0, 5)}` : `${d}/${m}`;
  return long ? `${weekdayShort(bucket.key)}, ${formatDate(bucket.key)}` : `${d}/${m}`;
}

export function createTrendChart({ buckets, unit, threshold }) {
  let active = -1;
  let geo = null;

  const frame = createFrame({ label: 'Biểu đồ tỉ lệ chấp nhận và số sự KPH theo thời gian', onRender: render });

  function render(W) {
    const M = { l: 40, r: 14, t: 10 };
    const rateH = W < 520 ? 130 : 160;
    const gap = 30;
    const ncH = W < 520 ? 64 : 80;
    const axisH = 24;
    const H = M.t + rateH + gap + ncH + axisH;
    const n = buckets.length;
    const plotW = W - M.l - M.r;
    const band = plotW / n;
    const xc = (i) => M.l + band * (i + 0.5);

    // Rate panel: non-zero baseline is fine for a line; keep the threshold in view.
    const rates = buckets.map((b) => b.rate).filter((v) => v != null);
    const minRate = rates.length ? Math.min(...rates) : 1;
    const lo = Math.max(0, Math.min(Math.floor((Math.min(minRate, threshold) - 0.05) * 10) / 10, 0.6));
    const step = 1 - lo > 0.5 ? 0.2 : 0.1;
    const yr = (v) => M.t + (1 - (v - lo) / (1 - lo)) * rateH;
    const rateTicks = [];
    for (let v = 1; v >= lo - 1e-9; v -= step) rateTicks.push(Math.round(v * 100) / 100);

    const ncTop = M.t + rateH + gap;
    const ncMax = niceMax(Math.max(...buckets.map((b) => b.ncCount), 0));
    const yn = (v) => ncTop + ncH - (v / ncMax) * ncH;
    const ncTicks = ncMax <= 1 ? [0, ncMax] : [0, ncMax / 2, ncMax].filter((v) => Number.isInteger(v));

    const segments = [];
    let cur = [];
    buckets.forEach((b, i) => {
      if (b.rate == null) { if (cur.length) segments.push(cur); cur = []; } else cur.push([xc(i), yr(b.rate)]);
    });
    if (cur.length) segments.push(cur);

    const maxLabels = Math.max(2, Math.floor(plotW / 54));
    const labelStep = Math.ceil(n / maxLabels);
    const barW = Math.max(1, Math.min(24, band - 2, band * 0.7));
    const showDots = band >= 9;

    geo = { xc, yr, yn, M, plotW, band, n, ncTop, ncH };

    const cross = s('line', { class: 'chart__cross', x1: 0, x2: 0, y1: M.t, y2: ncTop + ncH, visibility: 'hidden' });
    const overlay = s('rect', { class: 'chart__hit', x: M.l, y: 0, width: plotW, height: ncTop + ncH });
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' },
      // grid + axes
      rateTicks.map((v) => [
        s('line', { class: 'chart__grid', x1: M.l, x2: W - M.r, y1: yr(v), y2: yr(v) }),
        s('text', { class: 'chart__tick', x: M.l - 8, y: yr(v) + 4, 'text-anchor': 'end', text: `${Math.round(v * 100)}%` }),
      ]),
      threshold > lo && [
        s('line', { class: 'chart__ref', x1: M.l, x2: W - M.r, y1: yr(threshold), y2: yr(threshold) }),
        s('text', { class: 'chart__ref-label', x: W - M.r, y: yr(threshold) - 5, 'text-anchor': 'end', text: `Ngưỡng ${Math.round(threshold * 100)}%` }),
      ],
      ncTicks.map((v) => [
        v > 0 && s('line', { class: 'chart__grid', x1: M.l, x2: W - M.r, y1: yn(v), y2: yn(v) }),
        s('text', { class: 'chart__tick', x: M.l - 8, y: yn(v) + 4, 'text-anchor': 'end', text: formatNumber(v) }),
      ]),
      s('line', { class: 'chart__axis', x1: M.l, x2: W - M.r, y1: ncTop + ncH, y2: ncTop + ncH }),
      // marks
      buckets.map((b, i) => b.ncCount > 0 && s('path', { class: 'chart__bar chart__bar--nc', 'data-i': i, d: barPath(xc(i) - barW / 2, yn(b.ncCount), barW, ncTop + ncH - yn(b.ncCount)) })),
      cross,
      segments.map((pts) => (pts.length > 1
        ? s('polyline', { class: 'chart__line', points: pts.map((p) => p.join(',')).join(' ') })
        : null)),
      buckets.map((b, i) => b.rate != null && (showDots || segments.some((sg) => sg.length === 1 && sg[0][0] === xc(i)))
        && s('circle', { class: ['chart__dot', b.rate < threshold && 'is-low'], 'data-i': i, cx: xc(i), cy: yr(b.rate), r: 4 })),
      buckets.map((b, i) => i % labelStep === 0
        && s('text', { class: 'chart__tick chart__tick--x', x: xc(i), y: H - 6, 'text-anchor': 'middle', text: bucketLabel(b, unit) })),
      overlay,
    );

    overlay.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      setActive(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - M.l) / band))));
    });
    overlay.addEventListener('pointerleave', () => setActive(-1));
    if (active >= 0) requestAnimationFrame(() => setActive(active, true));
    return svg;
  }

  function setActive(i, force) {
    if (i === active && !force) return;
    active = i;
    const svg = frame.el.querySelector('svg');
    if (!svg || !geo) return;
    svg.querySelectorAll('.is-active').forEach((x) => x.classList.remove('is-active'));
    const cross = svg.querySelector('.chart__cross');
    if (i < 0) { cross.setAttribute('visibility', 'hidden'); frame.hideTip(); return; }
    const x = geo.xc(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    svg.querySelectorAll(`[data-i="${i}"]`).forEach((m) => m.classList.add('is-active'));
    const b = buckets[i];
    frame.showTip(x, geo.M.t, [
      h('div', { class: 'chart__tip-head' }, bucketLabel(b, unit, { long: true })),
      tipRow('chart__key--line', 'tỉ lệ chấp nhận', b.rate == null ? '—' : formatPercent(b.rate), b.inspections ? `${b.passes}/${b.inspections} lần` : 'không có lần kiểm'),
      tipRow('chart__key--nc', 'sự KPH', formatNumber(b.ncCount), b.ncCount ? `SL ${formatNumber(b.ncQuantity)}` : null),
    ]);
  }

  frame.el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = active < 0 ? buckets.length - 1 : active + (e.key === 'ArrowRight' ? 1 : -1);
    setActive(Math.min(buckets.length - 1, Math.max(0, next)));
  });
  frame.el.addEventListener('focus', () => { if (active < 0) setActive(buckets.length - 1); });
  frame.el.addEventListener('blur', () => setActive(-1));

  return { el: frame.el, destroy: frame.destroy };
}

/* ---------------- Pareto: share per cause (columns) + cumulative share (line), one 0–100% axis ---------------- */

export function createParetoChart({ rows, unitLabel, cut, onHover }) {
  let active = -1;
  let geo = null;
  const frame = createFrame({ label: 'Biểu đồ Pareto nguyên nhân KPH', onRender: render });

  function render(W) {
    const M = { l: 40, r: 14, t: 12 };
    const plotH = W < 520 ? 170 : 200;
    const axisH = 24;
    const H = M.t + plotH + axisH;
    const n = rows.length;
    const plotW = W - M.l - M.r;
    const band = plotW / n;
    const xc = (i) => M.l + band * (i + 0.5);
    const y = (v) => M.t + (1 - v) * plotH;
    const barW = Math.max(4, Math.min(28, band * 0.62));
    geo = { xc, y, M };

    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' },
      [0, 0.25, 0.5, 0.75, 1].map((v) => [
        v > 0 && s('line', { class: 'chart__grid', x1: M.l, x2: W - M.r, y1: y(v), y2: y(v) }),
        s('text', { class: 'chart__tick', x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end', text: `${v * 100}%` }),
      ]),
      s('line', { class: 'chart__ref', x1: M.l, x2: W - M.r, y1: y(cut), y2: y(cut) }),
      s('text', { class: 'chart__ref-label', x: W - M.r, y: y(cut) - 5, 'text-anchor': 'end', text: `${cut * 100}%` }),
      s('line', { class: 'chart__axis', x1: M.l, x2: W - M.r, y1: y(0), y2: y(0) }),
      rows.map((r, i) => s('path', {
        class: ['chart__bar', r.vital ? 'chart__bar--vital' : 'chart__bar--rest'], 'data-i': i,
        d: barPath(xc(i) - barW / 2, y(r.share), barW, plotH * r.share),
      })),
      n > 1 && s('polyline', { class: 'chart__line chart__line--cum', points: rows.map((r, i) => `${xc(i)},${y(r.cumulative)}`).join(' ') }),
      rows.map((r, i) => s('circle', { class: 'chart__dot chart__dot--cum', 'data-i': i, cx: xc(i), cy: y(r.cumulative), r: 4 })),
      rows.map((r, i) => s('text', { class: ['chart__tick', 'chart__tick--x', r.vital && 'is-vital'], x: xc(i), y: H - 6, 'text-anchor': 'middle', text: r.other ? '…' : String(i + 1) })),
      rows.map((r, i) => {
        const hit = s('rect', { class: 'chart__hit', x: M.l + band * i, y: 0, width: band, height: M.t + plotH });
        hit.addEventListener('pointerenter', () => setActive(i));
        hit.addEventListener('pointerleave', () => setActive(-1));
        return hit;
      }),
    );
    if (active >= 0) requestAnimationFrame(() => setActive(active, true));
    return svg;
  }

  function setActive(i, force) {
    if (i === active && !force) return;
    active = i;
    onHover?.(i);
    const svg = frame.el.querySelector('svg');
    if (!svg || !geo) return;
    svg.querySelectorAll('.is-active').forEach((x) => x.classList.remove('is-active'));
    if (i < 0) { frame.hideTip(); return; }
    svg.querySelectorAll(`[data-i="${i}"]`).forEach((m) => m.classList.add('is-active'));
    const r = rows[i];
    frame.showTip(geo.xc(i), geo.y(Math.max(r.cumulative, r.share)) - 8, [
      h('div', { class: 'chart__tip-head' }, r.name),
      tipRow(r.vital ? 'chart__key--vital' : 'chart__key--rest', `${unitLabel} · ${formatPercent(r.share)}`, formatNumber(r.value)),
      tipRow('chart__key--cum', 'luỹ kế', formatPercent(r.cumulative)),
    ]);
  }

  frame.el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = active < 0 ? 0 : active + (e.key === 'ArrowRight' ? 1 : -1);
    setActive(Math.min(rows.length - 1, Math.max(0, next)));
  });
  frame.el.addEventListener('focus', () => { if (active < 0) setActive(0); });
  frame.el.addEventListener('blur', () => setActive(-1));

  return { el: frame.el, setActive: (i) => setActive(i), destroy: frame.destroy };
}
