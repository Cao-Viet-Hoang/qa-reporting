// Confirmation dialog built on <dialog>. On phones it renders as a bottom sheet (CSS).
import { h } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * confirmDialog({ title, message, confirmLabel, tone: 'danger'|'default', details?: Node, onConfirm?: async () => void })
 * Resolves true/false. If onConfirm is given, the dialog stays open (loading) until it settles;
 * on error the message is shown inline and the dialog stays open.
 */
export function confirmDialog({ title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Huỷ', tone = 'default', details, onConfirm }) {
  return new Promise((resolve) => {
    let busy = false;
    const errorEl = h('p', { class: 'dialog__error', role: 'alert', hidden: true });
    const confirmBtn = h('button', { class: `btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, confirmLabel);
    const cancelBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, cancelLabel);

    const dialog = h('dialog', { class: `dialog dialog--${tone}`, 'aria-labelledby': 'dlg-title' },
      h('div', { class: 'dialog__body' },
        tone === 'danger' && h('div', { class: 'dialog__glyph' }, icon('trash', { size: 20 })),
        h('h2', { class: 'dialog__title', id: 'dlg-title' }, title),
        message && h('p', { class: 'dialog__msg' }, message),
        details,
        errorEl,
      ),
      h('div', { class: 'dialog__actions' }, cancelBtn, confirmBtn),
    );

    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    cancelBtn.addEventListener('click', () => !busy && finish(false));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (!busy) finish(false); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog && !busy) finish(false); });
    confirmBtn.addEventListener('click', async () => {
      if (!onConfirm) return finish(true);
      busy = true;
      confirmBtn.classList.add('is-loading');
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      errorEl.hidden = true;
      try {
        await onConfirm();
        finish(true);
      } catch (err) {
        busy = false;
        confirmBtn.classList.remove('is-loading');
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        errorEl.textContent = err?.message || 'Có lỗi xảy ra.';
        errorEl.hidden = false;
      }
    });

    document.body.append(dialog);
    dialog.showModal();
    cancelBtn.focus();
  });
}
