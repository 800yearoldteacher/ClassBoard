/* 태블릿 안 저장(IndexedDB)
   - lessons: 수업 { id, title, createdAt, updatedAt, pageIds }
   - pages:   쪽 { id, lessonId, bg }
   - strokes: 선 { id, pageId, seq, tool, color, w, sim, pts }  ← 선을 하나 그을 때마다 한 줄씩 저장합니다
   - meta:    지금 연 수업·쪽 같은 작은 값 { key, value }
   선을 쪽 안에 배열로 넣으면 선이 2,000개일 때 한 줄 그을 때마다 쪽 전체를 다시 써야 해서, 선은 따로 저장합니다. */

const DB_NAME = 'classboard';
const DB_VERSION = 1;

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
    };
    req.onsuccess = () => resolve(req.result);
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
