// Nonconformity photos for one checklist item: capture/upload, compress, thumbnails, delete, view.
// Remote thumbnails are NOT fetched automatically — each shows a placeholder until the user taps it.
import { h, clear } from '../core/dom.js';
import { errorMessage } from '../data/errors.js';
import { imageService } from '../services/image-service.js';
import { toDataUrl } from '../images/compress.js';
import { icon } from './icons.js';
import { openImageViewer } from './image-viewer.js';
import { toast } from './toast.js';

/**
 * createImageField({ ids, reportId, title, onChange(ids), onRemove(id) })
 * onRemove lets the owner decide whether a removed id was remote (deleted only after save) or local.
 */
export function createImageField({ ids, reportId, title, onChange, onRemove }) {
  let current = [...ids];
  const loaded = new Map(); // id -> dataURL (local or fetched on demand)
  const busy = []; // { key, label, state: 'compress'|'error', message }

  const grid = h('div', { class: 'shots__grid' });
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const el = h('div', { class: 'shots' },
    h('div', { class: 'shots__head' },
      h('span', { class: 'shots__label' }, 'Hình ảnh sự KPH'),
      h('span', { class: 'shots__meta num' }),
    ),
    grid,
    h('div', { class: 'shots__actions' },
      h('button', { type: 'button', class: 'btn btn--soft btn--sm shots__cta', onClick: () => cameraInput.click() }, icon('camera', { size: 16 }), 'Chụp ảnh'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onClick: () => fileInput.click() }, icon('image', { size: 16 }), 'Chọn ảnh'),
    ),
    cameraInput, fileInput,
  );
  const meta = el.querySelector('.shots__meta');

  async function addFiles(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    for (const file of list) {
      const job = { key: Math.random().toString(36).slice(2), state: 'compress' };
      busy.push(job);
      render();
      try {
        const id = await imageService.addFromFile(file, reportId);
        const base64 = await imageService.getLocal(id);
        if (base64) loaded.set(id, toDataUrl(base64));
        busy.splice(busy.indexOf(job), 1);
        current = [...current, id];
        onChange(current);
      } catch (err) {
        job.state = 'error';
        job.message = errorMessage(err);
        toast(`${file.name || 'Ảnh'}: ${job.message}`, { type: 'error' });
      }
      render();
    }
  }

  cameraInput.addEventListener('change', () => { addFiles(cameraInput.files); cameraInput.value = ''; });
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

  async function revealLocal(id, img) {
    const base64 = await imageService.getLocal(id).catch(() => null);
    if (base64) { loaded.set(id, toDataUrl(base64)); img.src = loaded.get(id); img.parentElement?.classList.add('is-loaded'); }
  }

  function thumb(id, index) {
    const isLocal = imageService.isPending(id);
    const src = loaded.get(id);
    const img = h('img', { class: 'shot__img', alt: '', src: src || null, loading: 'lazy', decoding: 'async' });
    const tile = h('div', { class: ['shot', src && 'is-loaded', isLocal && 'is-local'] },
      h('button', {
        type: 'button', class: 'shot__open',
        'aria-label': `Xem ảnh ${index + 1}${isLocal ? ' (chưa đồng bộ)' : ''}`,
        onClick: () => openImageViewer(current, index, { title }),
      },
      img,
      !src && h('span', { class: 'shot__placeholder' }, icon('eye', { size: 16 }), h('span', null, 'Xem'))),
      isLocal && h('span', { class: 'shot__badge', title: 'Ảnh mới, sẽ tải lên khi lưu báo cáo' }, icon('device', { size: 11 })),
      h('button', {
        type: 'button', class: 'shot__remove', 'aria-label': `Xoá ảnh ${index + 1}`,
        onClick: () => {
          current = current.filter((x) => x !== id);
          loaded.delete(id);
          onRemove(id);
          onChange(current);
          render();
        },
      }, icon('x', { size: 13 })),
    );
    // Local (unsynced) images are already on the device → showing them costs nothing.
    if (!src && isLocal) revealLocal(id, img);
    return tile;
  }

  function render() {
    clear(grid);
    current.forEach((id, i) => grid.append(thumb(id, i)));
    busy.forEach((job) => grid.append(h('div', { class: ['shot shot--busy', job.state === 'error' && 'is-error'] },
      job.state === 'error'
        ? h('button', { type: 'button', class: 'shot__err', title: job.message, onClick: () => { busy.splice(busy.indexOf(job), 1); render(); } }, icon('alert', { size: 16 }), h('span', null, 'Lỗi'))
        : h('span', { class: 'shot__progress' }, h('span', { class: 'spinner spinner--sm' }), h('span', null, 'Đang nén')))));
    grid.hidden = current.length === 0 && busy.length === 0;
    const pending = current.filter((id) => imageService.isPending(id)).length;
    meta.textContent = current.length
      ? `${current.length} ảnh${pending ? ` · ${pending} chưa đồng bộ` : ''}`
      : 'Chưa có ảnh';
  }

  render();
  return { el };
}
