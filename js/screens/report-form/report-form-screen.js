// The QC workspace: header (date, reporter, save state, progress, save buttons on desktop) · section
// index rail (wide desktop) · section accordions · sticky action bar (mobile/tablet). State lives in `ctrl.form`;
// every change autosaves a local draft (debounced) and nothing reaches Firestore until the user saves.
import { h, clear, createDisposer, focusLater } from '../../core/dom.js';
import { router } from '../../core/router.js';
import { appState } from '../../core/store.js';
import {
  debounce, todayISO, formatDateLong, formatDateTime, formatTime, isValidISODate,
} from '../../core/utils.js';
import { APP_CONFIG, STORAGE_KEYS } from '../../config/app-config.js';
import { storage } from '../../local/storage.js';
import { drafts } from '../../local/drafts.js';
import { errorMessage } from '../../data/errors.js';
import {
  SECTIONS, SECTION_BY_KEY, STATUS, STATUS_LABEL, createEmptyForm, reportToForm, collectImageIds,
} from '../../domain/schema.js';
import { summarizeSection, summarizeReport } from '../../domain/report-summary.js';
import { validateForm } from '../../domain/validation.js';
import { reportService } from '../../services/report-service.js';
import { imageService } from '../../services/image-service.js';
import { catalogService } from '../../services/catalog-service.js';
import { confirmDialog } from '../../ui/dialog.js';
import { icon } from '../../ui/icons.js';
import { errorState } from '../../ui/states.js';
import { toast } from '../../ui/toast.js';
import { SECTION_RENDERERS, issueKey } from './sections.js';

const SYNC_TEXT = {
  new: 'Báo cáo mới · chưa lưu',
  clean: 'Đã đồng bộ',
  pending: 'Đang ghi trên máy…',
  local: 'Đã lưu trên máy · chưa đồng bộ',
  syncing: 'Đang lưu lên hệ thống…',
  error: 'Lỗi lưu trên máy',
};

export function mountReportForm(container, params, { route, shell }) {
  const disposer = createDisposer();
  let destroyed = false;
  const loadingEl = h('div', { class: 'ws-loading' }, h('span', { class: 'spinner' }), h('span', null, 'Đang mở báo cáo…'));
  container.append(loadingEl);

  init().catch((err) => {
    if (destroyed) return;
    clear(container).append(h('div', { class: 'page' }, errorState({ message: errorMessage(err), onRetry: () => router.navigate(location.hash.slice(1)) })));
  });

  let api = null;

  async function init() {
    await imageService.ready();
    const isNewRoute = route.name === 'new';
    let ctx;
    let remote = null;
    let localDraft = null;
    let notice = null;

    if (isNewRoute) {
      const reportId = reportService.newId();
      ctx = {
        reportId,
        isNew: true,
        form: createEmptyForm({ date: todayISO(), reporter: storage.getString(STORAGE_KEYS.reporter) || '' }),
        baseImageIds: [],
        uploadedUnsaved: [],
        baseUpdatedAt: null,
        remoteStatus: null,
      };
    } else {
      const reportId = params.id;
      localDraft = drafts.get(reportId);
      try {
        remote = await reportService.get(reportId);
      } catch (err) {
        if (!localDraft) throw err;
        notice = { tone: 'warn', text: `Không tải được bản trên hệ thống (${errorMessage(err)}). Đang mở bản lưu trên máy.` };
      }
      if (destroyed) return;
      if (!remote && !localDraft) {
        clear(container).append(h('div', { class: 'page' }, errorState({ message: 'Báo cáo không tồn tại hoặc đã bị xoá.' }),
          h('p', { class: 'center' }, h('a', { class: 'btn btn--soft', href: '#/reports' }, 'Về danh sách'))));
        return;
      }
      if (localDraft) {
        ctx = {
          reportId,
          isNew: !remote && localDraft.isNew,
          form: localDraft.form,
          baseImageIds: remote ? collectImageIds(remote) : (localDraft.baseImageIds || []),
          uploadedUnsaved: localDraft.uploadedUnsaved || [],
          baseUpdatedAt: localDraft.baseUpdatedAt || null,
          remoteStatus: remote?.status || null,
        };
        const remoteNewer = remote && remote.updatedAt && localDraft.baseUpdatedAt && remote.updatedAt > localDraft.baseUpdatedAt;
        if (!notice) {
          notice = remoteNewer
            ? { tone: 'warn', text: `Có thay đổi chưa đồng bộ trên máy (lưu ${formatDateTime(localDraft.savedAt)}), nhưng báo cáo trên hệ thống đã được cập nhật sau đó (${formatDateTime(remote.updatedAt)}). Lưu sẽ ghi đè bản trên hệ thống.`, discard: Boolean(remote) }
            : { tone: 'info', text: `Đã khôi phục thay đổi chưa đồng bộ (lưu trên máy lúc ${formatDateTime(localDraft.savedAt)}).`, discard: Boolean(remote) };
        }
      } else {
        ctx = {
          reportId,
          isNew: false,
          form: reportToForm(remote),
          baseImageIds: collectImageIds(remote),
          uploadedUnsaved: [],
          baseUpdatedAt: remote.updatedAt || null,
          remoteStatus: remote.status,
        };
      }
    }
    if (destroyed) return;
    api = buildWorkspace(container, ctx, { notice, remote, disposer, shell });
  }

  return {
    unmount() {
      destroyed = true;
      api?.teardown();
      disposer.dispose();
    },
  };
}

/* =================================================================================== */

function buildWorkspace(container, ctx, { notice, remote, disposer, shell }) {
  const form = ctx.form;
  const sectionTracks = new Map(); // sectionKey -> [destroy fns]
  const open = new Set();
  let syncState = drafts.get(ctx.reportId) ? 'local' : (ctx.isNew ? 'new' : 'clean');
  let lastLocalAt = drafts.get(ctx.reportId)?.savedAt || null;
  let lastSyncedAt = remote?.updatedAt || null;
  let saving = false;
  let issues = [];
  let summaryFrame = 0;

  /* ---------------- Controller handed to section renderers ---------------- */

  const ctrl = {
    form,
    reportId: ctx.reportId,
    change({ structural, focus } = {}) {
      if (structural) renderSection(structural, focus);
      markDirty();
    },
    track(sectionKey, destroy) {
      if (!sectionTracks.has(sectionKey)) sectionTracks.set(sectionKey, []);
      sectionTracks.get(sectionKey).push(destroy);
    },
    sectionBody: (key) => sectionEls[key]?.body,
    onImageRemoved(id) {
      const remoteKnown = ctx.baseImageIds.includes(id) || ctx.uploadedUnsaved.includes(id);
      if (!remoteKnown && imageService.isPending(id)) imageService.discardLocal(id);
      // Remote images are deleted only after the report save without them is confirmed.
    },
  };

  /* ---------------- Local autosave ---------------- */

  const persistLocal = debounce(() => {
    try {
      lastLocalAt = drafts.save({
        reportId: ctx.reportId,
        isNew: ctx.isNew,
        form,
        baseImageIds: ctx.baseImageIds,
        uploadedUnsaved: ctx.uploadedUnsaved,
        baseUpdatedAt: ctx.baseUpdatedAt,
      });
      if (!saving) setSync('local');
      // A new report gets a stable URL once something exists to restore on reload.
      if (location.hash.startsWith('#/new')) router.replaceSilently(`/report/${ctx.reportId}`);
    } catch (err) {
      setSync('error');
      toast(err.message, { type: 'error' });
    }
  }, APP_CONFIG.autosaveDelayMs);

  function markDirty() {
    if (!saving) setSync('pending');
    persistLocal();
    scheduleSummary();
  }

  /* ---------------- DOM skeleton ---------------- */

  const back = h('a', { class: 'ws-back', href: '#/reports', 'aria-label': 'Về danh sách báo cáo', title: 'Về danh sách báo cáo' }, icon('arrowLeft', { size: 20 }));
  const dateInput = h('input', { class: 'ws-date__input', type: 'date', value: form.date, max: '2100-12-31', 'aria-label': 'Ngày báo cáo', required: true });
  const dateLabel = h('span', { class: 'ws-date__label' });
  const reporterInput = h('input', {
    class: 'ws-reporter__input', type: 'text', value: form.reporter, placeholder: 'Nhập tên',
    autocomplete: 'name', 'aria-label': 'Người báo cáo', maxlength: 80,
  });
  const syncEl = h('span', { class: 'sync', role: 'status', 'aria-live': 'polite' });
  const progressEl = h('div', { class: 'ws-progress' });

  const draftBtn = h('button', { class: 'btn btn--ghost btn--lg actionbar__draft', type: 'button' }, h('span', { class: 'btn__label' }, 'Lưu nháp'));
  const doneBtn = h('button', { class: 'btn btn--primary btn--lg actionbar__done', type: 'button' }, icon('check', { size: 18 }), h('span', { class: 'btn__label' }, 'Hoàn tất'));
  const draftBtnSide = h('button', { class: 'btn btn--ghost', type: 'button' }, h('span', { class: 'btn__label' }, 'Lưu nháp'));
  const doneBtnSide = h('button', { class: 'btn btn--primary', type: 'button' }, h('span', { class: 'btn__label' }, 'Hoàn tất'));

  const header = h('header', { class: 'ws-head' },
    h('div', { class: 'ws-head__inner' },
      h('div', { class: 'ws-head__row' },
        back,
        h('div', { class: 'field ws-date', 'data-issue': issueKey('header', '', 'date') },
          h('label', { class: 'ws-date__wrap' }, dateLabel, dateInput, icon('calendar', { size: 16, cls: 'ws-date__icon' })),
          h('span', { class: 'field__error', role: 'alert' })),
        h('div', { class: 'field ws-reporter', 'data-issue': issueKey('header', '', 'reporter') },
          h('label', { class: 'ws-reporter__wrap' }, h('span', { class: 'ws-reporter__label' }, 'Người báo cáo'), reporterInput),
          h('span', { class: 'field__error', role: 'alert' })),
        h('div', { class: 'ws-head__actions' }, draftBtnSide, doneBtnSide),
      ),
      h('div', { class: 'ws-head__meta' }, syncEl, progressEl),
    ),
  );

  const noticeEl = notice && h('div', { class: `notice notice--${notice.tone} ws-notice`, role: 'status' },
    icon(notice.tone === 'warn' ? 'alert' : 'restore', { size: 16 }),
    h('p', null, notice.text),
    notice.discard && h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: discardLocalChanges }, 'Bỏ thay đổi trên máy'),
  );

  // Section index rail (desktop) — doubles as progress map.
  const railItems = {};
  const rail = h('nav', { class: 'ws-rail', 'aria-label': 'Các phần của báo cáo' },
    h('div', { class: 'ws-rail__group' }, h('span', { class: 'ws-rail__part' }, 'Phần 1'),
      SECTIONS.filter((s) => s.part === 1).map((s) => railItem(s))),
    h('div', { class: 'ws-rail__group' }, h('span', { class: 'ws-rail__part' }, 'Phần 2'), railItem(SECTION_BY_KEY.nonconformities)),
  );
  function railItem(s) {
    const el = h('button', { class: 'rail-item', type: 'button', onClick: () => focusSection(s.key) },
      h('span', { class: 'rail-item__no num' }, s.no || ''),
      h('span', { class: 'rail-item__name' }, s.short),
      h('span', { class: 'rail-item__state' }));
    railItems[s.key] = el;
    return el;
  }

  // Sections
  const sectionEls = {};
  const part1 = h('section', { class: 'ws-part', 'aria-labelledby': 'part1-title' },
    h('h2', { class: 'ws-part__title', id: 'part1-title' }, h('span', { class: 'ws-part__tag' }, 'Phần 1'), 'Kiểm soát chất lượng'),
    SECTIONS.filter((s) => s.part === 1).map((s) => sectionShell(s)));
  const part2 = h('section', { class: 'ws-part ws-part--nc', 'aria-labelledby': 'part2-title' },
    h('h2', { class: 'ws-part__title', id: 'part2-title' }, h('span', { class: 'ws-part__tag' }, 'Phần 2'), 'Kiểm soát sự KPH'),
    h('p', { class: 'ws-part__lede' }, SECTION_BY_KEY.nonconformities.hint),
    sectionShell(SECTION_BY_KEY.nonconformities, { flat: true }));

  function sectionShell(s, { flat = false } = {}) {
    const bodyId = `sec-${s.key}`;
    const body = h('div', { class: 'sec__body', id: bodyId, role: 'region', 'aria-labelledby': `${bodyId}-h` });
    const summaryEl = h('span', { class: 'sec__summary' });
    const toggle = h('button', {
      class: 'sec__toggle', type: 'button', id: `${bodyId}-h`, 'aria-expanded': 'false', 'aria-controls': bodyId,
      onClick: () => setOpen(s.key, !open.has(s.key)),
    },
      s.no && h('span', { class: 'sec__no num' }, s.no),
      h('span', { class: 'sec__titles' },
        h('span', { class: 'sec__title' }, s.title),
        summaryEl),
      icon('chevronDown', { size: 18, cls: 'sec__chev' }));
    const el = h('article', { class: ['sec', flat && 'sec--flat'], 'data-section': s.key },
      !flat && toggle,
      h('div', { class: 'sec__panel' }, h('div', { class: 'sec__inner' }, s.hint && !flat && h('p', { class: 'sec__hint' }, s.hint), body)));
    sectionEls[s.key] = { el, body, summaryEl, toggle, flat, rendered: false };
    if (flat) open.add(s.key);
    return el;
  }

  const actionbar = h('div', { class: 'actionbar' },
    h('div', { class: 'actionbar__inner' }, draftBtn, doneBtn));

  const workspace = h('div', { class: 'ws' },
    header,
    noticeEl,
    h('div', { class: 'ws-grid' },
      rail,
      h('div', { class: 'ws-main' }, part1, part2)),
    actionbar,
  );
  clear(container).append(workspace);

  /* ---------------- Section rendering & disclosure ---------------- */

  function renderSection(key, focus) {
    const entry = sectionEls[key];
    (sectionTracks.get(key) || []).forEach((fn) => fn());
    sectionTracks.set(key, []);
    clear(entry.body).append(SECTION_RENDERERS[key](ctrl));
    entry.rendered = true;
    paintIssues();
    if (focus) {
      const row = entry.body.querySelector(`[data-key="${focus.rowKey}"]`);
      if (row) {
        row.classList.add('is-new');
        setTimeout(() => row.classList.remove('is-new'), 900);
        focusLater(() => row.querySelector(focus.selector) || row.querySelector('input, select, textarea, button'));
      }
    }
  }

  function setOpen(key, value, { scroll = false } = {}) {
    const entry = sectionEls[key];
    if (entry.flat) value = true;
    if (value) {
      if (!entry.rendered) renderSection(key);
      open.add(key);
    } else open.delete(key);
    entry.el.classList.toggle('is-open', value);
    entry.toggle.setAttribute('aria-expanded', String(value));
    railItems[key]?.classList.toggle('is-open', value);
    if (scroll) requestAnimationFrame(() => entry.el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    saveOpenState();
  }

  /** Rail click: open this section, collapse the others in Phần 1 (focus mode), scroll to it. */
  function focusSection(key) {
    SECTIONS.forEach((s) => { if (s.key !== key && s.part === 1 && open.has(s.key)) setOpen(s.key, false); });
    setOpen(key, true, { scroll: true });
    const first = sectionEls[key].body.querySelector('input, select, textarea, [role="radio"]');
    if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus({ preventScroll: true }), 250);
  }

  function saveOpenState() {
    try { sessionStorage.setItem(`qc.open.${ctx.reportId}`, JSON.stringify([...open])); } catch { /* optional */ }
  }

  function initialOpen() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(`qc.open.${ctx.reportId}`) || 'null'); } catch { /* ignore */ }
    if (Array.isArray(saved)) return saved.filter((k) => sectionEls[k]);
    // New report: open the first section. Existing report: open sections with failures, else the first empty one.
    const sums = Object.fromEntries(SECTIONS.map((s) => [s.key, summarizeSection(s.key, form)]));
    const withFails = SECTIONS.filter((s) => s.part === 1 && sums[s.key].fails > 0).map((s) => s.key);
    if (withFails.length) return withFails;
    const firstEmpty = SECTIONS.find((s) => s.part === 1 && !sums[s.key].filled);
    return [firstEmpty?.key || 'incoming'];
  }

  /* ---------------- Summaries (collapsed headers, rail, progress, context) ---------------- */

  function sectionChips(key, sum) {
    const chips = [];
    if (sum.fails > 0) chips.push(h('span', { class: 'chip chip--fail' }, `${sum.fails} không đạt`));
    if (sum.label) chips.push(h('span', { class: 'chip' }, sum.label));
    if (sum.images > 0) chips.push(h('span', { class: 'chip' }, `${sum.images} ảnh`));
    return chips;
  }

  function paintSummaries() {
    summaryFrame = 0;
    const report = summarizeReport(form);
    SECTIONS.forEach((s) => {
      const sum = report.sections[s.key];
      const entry = sectionEls[s.key];
      const chips = sectionChips(s.key, sum);
      entry.summaryEl.replaceChildren(...chips);
      entry.summaryEl.hidden = chips.length === 0;
      entry.el.classList.toggle('has-fail', sum.fails > 0);
      entry.el.classList.toggle('is-filled', sum.filled > 0);
      const state = sum.fails > 0 ? 'fail' : (sum.filled > 0 ? 'ok' : 'empty');
      const rail = railItems[s.key];
      if (rail) {
        rail.dataset.state = state;
        rail.querySelector('.rail-item__state').replaceChildren(
          state === 'fail' ? h('span', { class: 'rail-count rail-count--fail num' }, sum.fails)
            : state === 'ok' ? icon('check', { size: 13 }) : h('span', { class: 'rail-dot' }));
        rail.setAttribute('aria-label', `${s.no ? `Ý ${s.no}. ` : ''}${s.short}: ${state === 'fail' ? `${sum.fails} không đạt` : state === 'ok' ? 'đã nhập' : 'chưa có dữ liệu'}`);
      }
    });

    // Progress: one segment per Phần 1 section.
    progressEl.replaceChildren(
      h('div', { class: 'ws-progress__bar', role: 'img', 'aria-label': `Đã nhập ${report.touchedSections}/${report.part1Total} ý của Phần 1` },
        SECTIONS.filter((s) => s.part === 1).map((s) => {
          const sum = report.sections[s.key];
          return h('button', {
            class: `ws-progress__seg ws-progress__seg--${sum.fails > 0 ? 'fail' : sum.filled > 0 ? 'ok' : 'empty'}`,
            type: 'button', title: `${s.no}. ${s.short}`, 'aria-label': `Đi tới ý ${s.no}: ${s.short}`,
            onClick: () => focusSection(s.key),
          });
        })),
      h('span', { class: 'ws-progress__text' },
        h('b', { class: 'num' }, `${report.touchedSections}/${report.part1Total}`), ' mục đã nhập',
        report.fails > 0 && h('span', { class: 'ws-progress__fail' }, ' · ', h('b', { class: 'num' }, report.fails), ' không đạt'),
        report.nc > 0 && h('span', null, ' · ', h('b', { class: 'num' }, report.nc), ' KPH')),
    );
  }

  function scheduleSummary() {
    if (!summaryFrame) summaryFrame = requestAnimationFrame(paintSummaries);
  }

  /* ---------------- Header state ---------------- */

  function paintHeader() {
    const status = ctx.isNew && !ctx.remoteStatus ? 'new' : (ctx.remoteStatus || form.status);
    dateLabel.textContent = formatDateLong(form.date);
    const isDone = ctx.remoteStatus === STATUS.DONE;
    [doneBtn, doneBtnSide].forEach((b) => { b.querySelector('.btn__label').textContent = isDone ? 'Lưu hoàn tất' : 'Hoàn tất'; });
    [draftBtn, draftBtnSide].forEach((b) => {
      b.querySelector('.btn__label').textContent = isDone ? 'Chuyển về nháp' : 'Lưu nháp';
      b.title = isDone ? 'Lưu và chuyển trạng thái về Nháp' : 'Lưu lên hệ thống ở trạng thái Nháp';
    });
    workspace.dataset.status = status;
    setSync(syncState);
  }

  /** One status line: report status (once saved) · where the latest edits live. */
  function setSync(state) {
    syncState = state;
    syncEl.className = `sync sync--${state}`;
    const status = ctx.remoteStatus && STATUS_LABEL[ctx.remoteStatus];
    let text = SYNC_TEXT[state];
    if (state === 'local' && lastLocalAt) text = `Lưu trên máy ${formatTime(lastLocalAt)} · chưa đồng bộ`;
    if (state === 'clean' && lastSyncedAt) text = `Đã lưu lên hệ thống ${formatDateTime(lastSyncedAt)}`;
    syncEl.replaceChildren(...[
      state === 'syncing' && h('span', { class: 'spinner spinner--xs' }),
      status && state !== 'new' && h('span', { class: `sync__status sync__status--${ctx.remoteStatus}` }, status),
      h('span', { class: 'sync__text' }, text),
    ].filter(Boolean));
  }

  /* ---------------- Validation display ---------------- */

  function paintIssues() {
    const byKey = new Map();
    issues.forEach((i) => {
      const k = issueKey(i.section === 'header' ? 'header' : i.section, i.rowKey, i.field);
      if (!byKey.has(k)) byKey.set(k, i.message);
    });
    workspace.querySelectorAll('[data-issue]').forEach((el) => {
      const msg = byKey.get(el.dataset.issue);
      el.classList.toggle('is-invalid', Boolean(msg));
      const errEl = el.querySelector(':scope > .field__error');
      if (errEl) errEl.textContent = msg || '';
    });
  }

  function revalidateIfShowing() {
    if (!issues.length) return;
    const status = issues.some((i) => i.mode === STATUS.DONE) ? STATUS.DONE : STATUS.DRAFT;
    issues = validateForm(form, status).map((i) => ({ ...i, mode: status }));
    paintIssues();
  }

  /* ---------------- Save to Firestore ---------------- */

  async function save(status) {
    if (saving) return;
    const found = validateForm(form, status);
    issues = found.map((i) => ({ ...i, mode: status }));
    paintIssues();
    if (found.length) {
      const sectionsWithIssues = [...new Set(found.map((i) => i.section).filter((s) => s !== 'header'))];
      sectionsWithIssues.forEach((k) => setOpen(k, true));
      requestAnimationFrame(() => {
        const first = workspace.querySelector('.is-invalid');
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        first?.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
      });
      toast(found.length === 1 ? found[0].message : `Còn ${found.length} chỗ cần kiểm tra trước khi ${status === STATUS.DONE ? 'hoàn tất' : 'lưu'}.`, { type: 'warn' });
      return;
    }

    persistLocal.flush();
    saving = true;
    setSync('syncing');
    const btn = status === STATUS.DONE ? [doneBtn, doneBtnSide] : [draftBtn, draftBtnSide];
    btn.forEach((b) => b.classList.add('is-loading'));
    [doneBtn, doneBtnSide, draftBtn, draftBtnSide].forEach((b) => { b.disabled = true; });
    workspace.classList.add('is-saving');
    const editsBefore = JSON.stringify(form);

    try {
      const { updatedAt } = await reportService.save(ctx, status, {
        onPhase: (phase, p) => {
          if (phase === 'images' && p && p.total) syncEl.querySelector('.sync__text').textContent = `Đang tải ảnh ${Math.min(p.done + 1, p.total)}/${p.total}…`;
          if (phase === 'report') syncEl.querySelector('.sync__text').textContent = 'Đang lưu báo cáo…';
        },
      });
      form.status = status;
      ctx.remoteStatus = status;
      ctx.baseUpdatedAt = updatedAt;
      lastSyncedAt = updatedAt;
      storage.setString(STORAGE_KEYS.reporter, form.reporter.trim());
      if (JSON.stringify(form) === editsBefore) {
        persistLocal.cancel();
        drafts.remove(ctx.reportId);
        setSync('clean');
      } else {
        // The user kept typing while we saved — keep those edits as a fresh local draft.
        persistLocal();
        persistLocal.flush();
      }
      issues = [];
      paintIssues();
      paintHeader();
      noticeEl?.remove();
      toast(status === STATUS.DONE ? 'Đã hoàn tất báo cáo' : 'Đã lưu nháp lên hệ thống', { type: 'success' });
    } catch (err) {
      // Persist which images were uploaded during this failed attempt so a later discard can clean them.
      try {
        drafts.save({ reportId: ctx.reportId, isNew: ctx.isNew, form, baseImageIds: ctx.baseImageIds, uploadedUnsaved: ctx.uploadedUnsaved, baseUpdatedAt: ctx.baseUpdatedAt });
      } catch { /* surfaced below */ }
      setSync('local');
      toast(err.message, { type: 'error', action: { label: 'Thử lại', onClick: () => save(status) } });
    } finally {
      saving = false;
      workspace.classList.remove('is-saving');
      btn.forEach((b) => b.classList.remove('is-loading'));
      [doneBtn, doneBtnSide, draftBtn, draftBtnSide].forEach((b) => { b.disabled = false; });
      updateSaveAvailability();
    }
  }

  function updateSaveAvailability() {
    const offline = appState.get().mode === 'firestore' && !appState.get().online;
    [doneBtn, doneBtnSide, draftBtn, draftBtnSide].forEach((b) => { b.disabled = saving || offline; });
    actionbar.classList.toggle('is-offline', offline);
    actionbar.title = offline ? 'Đang ngoại tuyến — dữ liệu vẫn được lưu trên máy' : '';
  }

  async function discardLocalChanges() {
    const draft = drafts.get(ctx.reportId);
    const ok = await confirmDialog({
      title: 'Bỏ thay đổi trên máy?',
      message: 'Báo cáo sẽ được mở lại theo bản đang lưu trên hệ thống. Thay đổi chưa đồng bộ (kể cả ảnh mới) sẽ mất.',
      confirmLabel: 'Bỏ thay đổi',
      tone: 'danger',
    });
    if (!ok) return;
    persistLocal.cancel();
    await reportService.discardDraft(draft);
    router.navigate(`/report/${ctx.reportId}`);
  }

  /* ---------------- Events ---------------- */

  dateInput.addEventListener('change', () => {
    if (isValidISODate(dateInput.value)) form.date = dateInput.value;
    paintHeader();
    markDirty();
    revalidateIfShowing();
  });
  reporterInput.addEventListener('input', () => {
    form.reporter = reporterInput.value;
    // Remembered right away (not only on save) so the next new report is pre-filled.
    if (form.reporter.trim()) storage.setString(STORAGE_KEYS.reporter, form.reporter.trim());
    markDirty();
  });
  reporterInput.addEventListener('change', revalidateIfShowing);
  workspace.addEventListener('input', () => { if (issues.length) setTimeout(revalidateIfShowing, 0); });

  [draftBtn, draftBtnSide].forEach((b) => b.addEventListener('click', () => save(STATUS.DRAFT)));
  [doneBtn, doneBtnSide].forEach((b) => b.addEventListener('click', () => save(STATUS.DONE)));

  disposer.listen(window, 'beforeunload', () => persistLocal.flush());
  disposer.listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') persistLocal.flush(); });
  disposer.listen(window, 'keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(STATUS.DRAFT); }
  });

  // Hide the sticky action bar while the on-screen keyboard is up, so it never covers the input.
  const vv = window.visualViewport;
  if (vv) {
    const onViewport = () => workspace.classList.toggle('kb-open', vv.height < window.innerHeight * 0.78);
    disposer.listen(vv, 'resize', onViewport);
  }

  disposer.add(appState.subscribe(() => updateSaveAvailability()));

  /* ---------------- Initial paint ---------------- */

  const startOpen = new Set(initialOpen());
  SECTIONS.forEach((s) => setOpen(s.key, sectionEls[s.key].flat || startOpen.has(s.key)));
  paintHeader();
  setSync(syncState);
  paintSummaries();
  updateSaveAvailability();
  if (catalogService.all('suppliers').length === 0 && appState.get().catalogStatus === 'idle') catalogService.load().catch(() => {});
  if (!form.reporter) requestAnimationFrame(() => matchMedia('(pointer: fine)').matches && reporterInput.focus());

  return {
    teardown() {
      if (syncState === 'pending' || persistLocal.pending()) persistLocal.flush();
      if (drafts.get(ctx.reportId) && syncState !== 'clean') toast('Thay đổi chưa đồng bộ được giữ trên máy này.', { type: 'info' });
      sectionTracks.forEach((fns) => fns.forEach((fn) => fn()));
      if (summaryFrame) cancelAnimationFrame(summaryFrame);
    },
  };
}
