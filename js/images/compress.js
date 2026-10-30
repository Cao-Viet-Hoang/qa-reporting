// Client-side image compression: longest side ≤ 1280px, JPEG ~70%, returned as base64 (no data: prefix).
import { APP_CONFIG } from '../config/app-config.js';
import { appError } from '../data/errors.js';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(appError('image-decode')); };
    img.src = url;
  });
}

export async function compressImage(file) {
  const { maxDimension, quality, fallbackQuality, maxBase64Length } = APP_CONFIG.image;
  const img = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // flatten transparent PNGs
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const q of [quality, fallbackQuality, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length <= maxBase64Length) {
      canvas.width = 0; canvas.height = 0;
      return { base64, width, height, bytes: Math.round(base64.length * 0.75) };
    }
  }
  throw appError('image-too-large');
}

export function splitChunks(base64, size = APP_CONFIG.image.chunkSize) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += size) chunks.push(base64.slice(i, i + size));
  return chunks.length ? chunks : [''];
}

export const toDataUrl = (base64) => `data:image/jpeg;base64,${base64}`;
