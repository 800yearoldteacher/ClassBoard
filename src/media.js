/* 사진·PDF 자료
   - 사진은 긴 변이 MAX_SIDE보다 크면 줄여서 JPEG로 저장합니다(화면에 필요한 크기만큼).
   - PDF는 파일을 한 번만 저장하고, 쪽마다 'PDF의 몇 쪽'만 기억합니다(bg: { type: 'pdf', assetId, pdfPage }).
   - 쪽을 그릴 때는 그림(ImageBitmap)으로 풀어 두고 최근 것 몇 개만 기억합니다.
     PDF는 칠판 크기에 맞춰 그리며, 쪽을 넘길 때 끊기지 않도록 앞뒤 쪽을 미리 그려 둡니다.
   - pdf.js(PDF 그리기 부품)는 PDF를 처음 열 때만 불러옵니다. */

import * as store from './store.js';

const MAX_SIDE = 3000;
const CACHE_LIMIT = 10;
const cache = new Map();     // 키 → ImageBitmap 또는 그리는 중인 Promise
const docs = new Map();      // assetId → PDF 문서(최근 2개)

function remember(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  // 지금 칠판이 쓰는 그림일 수도 있으므로 닫지 않고 목록에서만 뺍니다(브라우저가 알아서 정리)
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

/* ---------- 사진 ---------- */

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

/* ---------- PDF ---------- */

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

async function openDoc(data) {
  const lib = await loadPdfjs();
  const base = import.meta.env.BASE_URL;
  return lib.getDocument({
    data,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  }).promise;
}

async function docFor(assetId) {
  if (docs.has(assetId)) return docs.get(assetId);
  const p = (async () => {
    const asset = await store.getAsset(assetId);
    if (!asset) throw new Error('PDF 원본을 찾지 못했습니다.');
    return openDoc(new Uint8Array(await asset.blob.arrayBuffer()));
  })();
  docs.set(assetId, p);
  while (docs.size > 2) {
    const [k, old] = docs.entries().next().value;
    docs.delete(k);
    old.then((d) => d.destroy()).catch(() => {});
  }
  p.catch(() => docs.delete(assetId));
  return p;
}

/* PDF 파일을 저장하고 { assetId, pages(전체 쪽 수), name }을 돌려줍니다. */
export async function importPdf(file) {
  const buf = await file.arrayBuffer();
  const doc = await openDoc(new Uint8Array(buf.slice(0)));   // pdf.js가 넘겨받은 자료를 비우므로 복사본을 줍니다
  const pages = doc.numPages;
  const asset = { id: crypto.randomUUID(), kind: 'pdf', name: file.name || 'PDF', blob: new Blob([buf], { type: 'application/pdf' }), pages };
  await store.putAsset(asset);
  docs.set(asset.id, Promise.resolve(doc));
  return { assetId: asset.id, pages, name: asset.name };
}

/* PDF 한 쪽을 w×h(실제 화소) 안에 잘리지 않게 맞춰 그림으로 그립니다. */
async function renderPdfPage(assetId, pageNo, w, h) {
  const doc = await docFor(assetId);
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(w / base.width, h / base.height);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width));
  c.height = Math.max(1, Math.floor(vp.height));
  const ctx = c.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return createImageBitmap(c);
}

/* ---------- 쪽 배경 그림 ---------- */

/* 쪽 배경에 쓸 그림을 준비합니다. size는 그릴 곳의 실제 화소 크기 { w, h }(PDF만 씁니다).
   사진·PDF가 아닌 배경이면 null입니다. */
export async function bitmapFor(bg, size = null) {
  if (!bg || !bg.assetId) return null;
  let key;
  let make;
  if (bg.type === 'image') {
    key = bg.assetId;
    make = async () => {
      const asset = await store.getAsset(bg.assetId);
      return asset ? createImageBitmap(asset.blob) : null;
    };
  } else if (bg.type === 'pdf') {
    const w = Math.round((size && size.w) || 1920);
    const h = Math.round((size && size.h) || 1080);
    key = `${bg.assetId}:${bg.pdfPage}:${w}x${h}`;
    make = () => renderPdfPage(bg.assetId, bg.pdfPage, w, h);
  } else {
    return null;
  }
  if (cache.has(key)) { const v = cache.get(key); remember(key, v); return v; }
  const p = make();
  remember(key, p);   // 같은 쪽을 동시에 두 번 그리지 않게 그리는 중인 것도 기억합니다
  try {
    const bmp = await p;
    remember(key, Promise.resolve(bmp));
    return bmp;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}

/* ---------- 수업 방에 올릴 배경 그림 ----------
   원본 파일은 올리지 않고, 화면용으로 줄인 그림(긴 변 1920px JPEG)만 data URL로 만들어 올립니다. */
const ROOM_SIDE = 1920;
const roomPics = new Map();   // 키 → Promise<data URL>

export function roomPicture(bg) {
  if (!bg || !bg.assetId || (bg.type !== 'image' && bg.type !== 'pdf')) return Promise.resolve(null);
  const key = bg.type === 'pdf' ? `${bg.assetId}:${bg.pdfPage}` : bg.assetId;
  if (!roomPics.has(key)) {
    const p = (async () => {
      const bmp = await bitmapFor(bg, { w: ROOM_SIDE, h: Math.round((ROOM_SIDE * 9) / 16) });
      if (!bmp) return null;
      const s = Math.min(1, ROOM_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * s));
      c.height = Math.max(1, Math.round(bmp.height * s));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8);
    })();
    p.catch(() => roomPics.delete(key));
    roomPics.set(key, p);
    while (roomPics.size > 20) roomPics.delete(roomPics.keys().next().value);
  }
  return roomPics.get(key);
}

/* 쪽을 넘길 때 끊기지 않도록 미리 그려 둡니다(실패해도 조용히 넘어갑니다). */
export function prefetch(bg, size) {
  if (!bg || bg.type !== 'pdf') return;
  bitmapFor(bg, size).catch(() => {});
}
