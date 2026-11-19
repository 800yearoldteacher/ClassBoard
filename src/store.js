/* 태블릿 안 저장(IndexedDB)
   - lessons: 수업 { id, title, createdAt, updatedAt, pageIds }
   - pages:   쪽 { id, lessonId, bg }
   - strokes: 선 { id, pageId, seq, tool, color, w, sim, pts }  ← 선을 하나 그을 때마다 한 줄씩 저장합니다
   - meta:    지금 연 수업·쪽 같은 작은 값 { key, value }
   - assets:  사진·PDF 원본 { id, kind: 'image' | 'pdf', name, blob, w?, h?, pages? }  (판 2에서 더함)
   선을 쪽 안에 배열로 넣으면 선이 2,000개일 때 한 줄 그을 때마다 쪽 전체를 다시 써야 해서, 선은 따로 저장합니다. */

const DB_NAME = 'classboard';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lessons')) db.createObjectStore('lessons', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) {
        db.createObjectStore('pages', { keyPath: 'id' }).createIndex('lessonId', 'lessonId');
      }
      if (!db.objectStoreNames.contains('strokes')) {
        db.createObjectStore('strokes', { keyPath: 'id' }).createIndex('pageId', 'pageId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // 새 판이 다른 창에서 저장소를 고치려 하면 이 창의 연결을 닫아 막지 않습니다
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('저장소가 다른 창에서 사용 중입니다.'));
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다.'));
  });
}
function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get(storeName, key) {
  const db = await open();
  return result(db.transaction(storeName).objectStore(storeName).get(key));
}
async function put(storeName, value) {
  const db = await open();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  return done(tx);
}

export async function getMeta(key) {
  const row = await get('meta', key);
  return row ? row.value : undefined;
}
export function setMeta(key, value) { return put('meta', { key, value }); }

export function getLesson(id) { return get('lessons', id); }
export function putLesson(lesson) { return put('lessons', lesson); }
export function getPage(id) { return get('pages', id); }
export function putPage(page) { return put('pages', page); }

export async function listLessons() {
  const db = await open();
  const rows = await result(db.transaction('lessons').objectStore('lessons').getAll());
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* 쪽 순서를 바꿔 저장합니다. */
export async function setPageOrder(lesson, pageIds) {
  const next = { ...lesson, pageIds: pageIds.slice(), updatedAt: Date.now() };
  await putLesson(next);
  return next;
}

/* ---------- 사진·PDF 원본 ---------- */
export function putAsset(asset) { return put('assets', asset); }
export function getAsset(id) { return get('assets', id); }

/* 어느 쪽도 쓰지 않는 원본을 지웁니다(쪽을 지운 뒤 부릅니다). */
export async function dropAssetIfUnused(assetId) {
  if (!assetId) return;
  const db = await open();
  const pages = await result(db.transaction('pages').objectStore('pages').getAll());
  if (pages.some((p) => p.bg && p.bg.assetId === assetId)) return;
  const tx = db.transaction('assets', 'readwrite');
  tx.objectStore('assets').delete(assetId);
  await done(tx);
}

/* 쪽 하나와 그 쪽의 선을 모두 지우고, 수업의 쪽 순서에서도 뺍니다(한 번에 저장). */
export async function deletePage(lesson, pageId) {
  const next = { ...lesson, pageIds: lesson.pageIds.filter((id) => id !== pageId), updatedAt: Date.now() };
  const db = await open();
  const tx = db.transaction(['lessons', 'pages', 'strokes'], 'readwrite');
  tx.objectStore('lessons').put(next);
  tx.objectStore('pages').delete(pageId);
  const idx = tx.objectStore('strokes').index('pageId');
  idx.openKeyCursor(IDBKeyRange.only(pageId)).onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    tx.objectStore('strokes').delete(cur.primaryKey);
    cur.continue();
  };
  await done(tx);
  return next;
}

/* 수업의 index 자리에 새 쪽을 넣습니다(쪽 순서와 쪽을 한 번에 저장). */
export async function insertPage(lesson, index, bg) {
  const page = { id: crypto.randomUUID(), lessonId: lesson.id, bg: { ...bg } };
  const pageIds = lesson.pageIds.slice();
  pageIds.splice(index, 0, page.id);
  const next = { ...lesson, pageIds, updatedAt: Date.now() };
  const db = await open();
  const tx = db.transaction(['lessons', 'pages'], 'readwrite');
  tx.objectStore('pages').put(page);
  tx.objectStore('lessons').put(next);
  await done(tx);
  return { lesson: next, page };
}

/* 새 수업과 첫 쪽을 한 번에 만듭니다. */
export async function createLesson(title) {
  const now = Date.now();
  const page = { id: crypto.randomUUID(), lessonId: null, bg: { type: 'chalk' } };
  const lesson = { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, pageIds: [page.id] };
  page.lessonId = lesson.id;
  const db = await open();
  const tx = db.transaction(['lessons', 'pages', 'meta'], 'readwrite');
  tx.objectStore('lessons').put(lesson);
  tx.objectStore('pages').put(page);
  tx.objectStore('meta').put({ key: 'currentLessonId', value: lesson.id });
  await done(tx);
  return { lesson, page };
}

export async function getStrokes(pageId) {
  const db = await open();
  const rows = await result(db.transaction('strokes').objectStore('strokes').index('pageId').getAll(pageId));
  return rows.sort((a, b) => a.seq - b.seq);
}
export function putStroke(stroke) { return put('strokes', stroke); }

/* 여러 선을 한 번에 넣거나(되돌리기로 살린 선) 지웁니다(고리 지우개). */
export async function putStrokes(strokes) {
  const db = await open();
  const tx = db.transaction('strokes', 'readwrite');
  const os = tx.objectStore('strokes');
  for (const s of strokes) os.put(s);
  return done(tx);
}
export async function deleteStrokes(ids) {
  const db = await open();
  const tx = db.transaction('strokes', 'readwrite');
  const os = tx.objectStore('strokes');
  for (const id of ids) os.delete(id);
  return done(tx);
}

/* 브라우저가 저장 공간이 부족할 때 이 앱의 자료를 지우지 않도록 요청합니다. */
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (_) { /* 지원하지 않는 브라우저 */ }
  return false;
}
