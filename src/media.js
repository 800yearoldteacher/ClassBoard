/* 사진·PDF 자료
   - 사진은 긴 변이 MAX_SIDE보다 크면 줄여서 JPEG로 저장합니다(화면에 필요한 크기만큼).
   - 저장한 원본은 쪽을 그릴 때 그림(ImageBitmap)으로 풀어 두고, 최근 것 몇 개만 기억합니다.
   - 3-2에서 PDF 쪽 그리기를 더합니다. */

import * as store from './store.js';

const MAX_SIDE = 3000;
const CACHE_LIMIT = 8;
const cache = new Map();   // assetId → ImageBitmap (오래 안 쓴 것부터 버림)

function remember(key, bmp) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, bmp);
  // 지금 칠판이 쓰는 그림일 수도 있으므로 닫지 않고 목록에서만 뺍니다(브라우저가 알아서 정리)
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

/* 사진 파일 하나를 줄여 저장하고 자료 id를 돌려줍니다. 사진의 회전 정보도 반영합니다. */
export async function importImage(file) {
  const src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';   // 투명한 부분(화면 캡처 등)은 흰색으로
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close();
  const blob = await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('사진을 바꾸지 못했습니다.'))), 'image/jpeg', 0.9));
  const asset = { id: crypto.randomUUID(), kind: 'image', name: file.name || '사진', blob, w, h };
  await store.putAsset(asset);
  return asset.id;
}

/* 쪽 배경에 쓸 그림을 준비합니다. 사진·PDF가 아닌 배경이면 null입니다. */
export async function bitmapFor(bg) {
  if (!bg || bg.type !== 'image' || !bg.assetId) return null;
  const key = bg.assetId;
  if (cache.has(key)) { const b = cache.get(key); remember(key, b); return b; }
  const asset = await store.getAsset(bg.assetId);
  if (!asset) return null;
  const bmp = await createImageBitmap(asset.blob);
  remember(key, bmp);
  return bmp;
}
