/* 태블릿 → 수업 방 올리기
   수업 방(rooms/{방코드}) 구조
   - meta                       { owner: uid, createdAt }      방 주인(보안 규칙이 이 uid만 쓰게 합니다)
   - state                      { sharing, pageId, bg, view, at } 지금 태블릿이 보는 쪽과 확대 상태
   - pages/{pageId}/bg          { type, img? }                 쪽 배경(사진·PDF 그림은 4-3)
   - pages/{pageId}/strokes/{id}  선 한 줄(점 목록은 짧은 글자로 줄임, room.js)
   - live/{id}, laser/{id}      그리는 중인 선, 레이저 잔상(4-2)
   수업 방에는 태블릿이 본 쪽의 배경과 선만 올리고, 원본 파일은 올리지 않습니다.
   Firebase 부품은 공유를 켤 때만 불러옵니다(평소 앱이 열리는 속도와 오프라인 사용에 영향 없음). */

import { firebaseConfig, ROOM_RE, strokeToRoom } from './room.js';
import { roomPicture } from './media.js';

let fb = null;            // 불러온 Firebase 함수와 db
let room = null;          // 방 코드
let enabled = false;
let connected = false;
let error = '';
const uploaded = new Set();   // 이번 공유에서 통째로 올린 쪽
const listeners = new Set();

function emit() { for (const fn of listeners) fn(status()); }
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function status() { return { enabled, connected, room, error }; }

export function viewUrl(code = room) {
  return code ? `${location.origin}${import.meta.env.BASE_URL}view.html#${code}` : '';
}

function newCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';   // 헷갈리는 l·o·0·1을 뺀 32자
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % 32]).join('');
}

async function load() {
  if (fb) return fb;
  const [appMod, authMod, dbMod] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/database'),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  // 이 기기에 남아 있는 익명 로그인을 먼저 쓰고, 없으면 새로 받습니다
  let user = await new Promise((resolve) => {
    const off = authMod.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
  if (!user) user = (await authMod.signInAnonymously(auth)).user;
  const db = dbMod.getDatabase(app);
  fb = { ...dbMod, db, uid: user.uid };
  dbMod.onValue(dbMod.ref(db, '.info/connected'), (s) => { connected = s.val() === true; emit(); });
  return fb;
}

const R = (path) => fb.ref(fb.db, `rooms/${room}${path ? `/${path}` : ''}`);

/* 방을 차지합니다. 이 기기가 주인이거나 주인이 없는 방이면 그 코드를 그대로 쓰고(보기 주소 유지),
   다른 기기가 주인이면 새 코드를 만듭니다. 돌려준 코드를 main.js가 저장합니다. */
async function claim(code) {
  if (code && ROOM_RE.test(code)) {
    const owner = (await fb.get(fb.ref(fb.db, `rooms/${code}/meta/owner`))).val();
    if (owner === fb.uid) return code;
    if (!owner) {
      await fb.set(fb.ref(fb.db, `rooms/${code}/meta`), { owner: fb.uid, createdAt: fb.serverTimestamp() });
      return code;
    }
  }
  const c = newCode();
  await fb.set(fb.ref(fb.db, `rooms/${c}/meta`), { owner: fb.uid, createdAt: fb.serverTimestamp() });
  return c;
}

/* 공유 켜기: 방을 차지하고, 지난 수업 방 자료를 비운 뒤 다시 올릴 준비를 합니다. */
export async function enable(savedCode) {
  error = '';
  try {
    await load();
    room = await claim(savedCode);
    await fb.update(R(''), { pages: null, live: null, laser: null, state: { sharing: true, at: fb.serverTimestamp() } });
    uploaded.clear();
    enabled = true;
  } catch (e) {
    console.error(e);
    error = String((e && e.code) || (e && e.message) || e);
    enabled = false;
  }
  emit();
  return enabled ? room : null;
}

/* 공유 끄기: PC 화면에 '공유가 꺼져 있습니다'를 보이게 합니다. 자료는 수업 종료 때 지웁니다. */
export function disable() {
  if (fb && room) fb.update(R('state'), { sharing: false, at: fb.serverTimestamp() }).catch(() => {});
  enabled = false;
  emit();
}

function bgToRoom(bg) {
  return { type: (bg && bg.type) || 'chalk' };
}

function write(promise) { promise.catch((e) => { console.error(e); error = String(e && e.code || e); emit(); }); }

/* 사진·PDF 쪽이면 화면용으로 줄인 배경 그림을 만들어 그 쪽의 bg.img로 올립니다(만드는 동안 PC에는 칠판색이 보입니다). */
async function attachPicture(page) {
  try {
    const img = await roomPicture(page.bg);
    if (!img || !enabled || !uploaded.has(page.id)) return;
    await fb.update(R(`pages/${page.id}/bg`), { img });
  } catch (e) {
    console.error(e);
  }
}

/* 쪽을 보여 줄 때: 이번 공유에서 처음 보는 쪽이면 배경과 선을 통째로 올리고, 지금 쪽 정보를 바꿉니다. */
export function showPage(page, strokes, view) {
  if (!enabled) return;
  if (!uploaded.has(page.id)) {
    const map = {};
    for (const s of strokes) map[s.id] = strokeToRoom(s);
    write(fb.set(R(`pages/${page.id}`), { bg: bgToRoom(page.bg), strokes: map }));
    uploaded.add(page.id);
    attachPicture(page);
  }
  write(fb.update(R('state'), { sharing: true, pageId: page.id, bg: bgToRoom(page.bg), view: { ...view }, at: fb.serverTimestamp() }));
}

export function setBackground(page) {
  if (!enabled || !uploaded.has(page.id)) return;
  write(fb.update(R(''), { [`pages/${page.id}/bg`]: bgToRoom(page.bg), 'state/bg': bgToRoom(page.bg) }));
  attachPicture(page);
}

/* 선 넣기·바꾸기(옮기기)·빼기. 아직 통째로 올리지 않은 쪽이면 건너뜁니다(보여 줄 때 함께 올라갑니다). */
export function putStrokes(pageId, list) {
  if (!enabled || !uploaded.has(pageId) || !list.length) return;
  const patch = {};
  for (const s of list) patch[s.id] = strokeToRoom(s);
  write(fb.update(R(`pages/${pageId}/strokes`), patch));
}
export function removeStrokes(pageId, ids) {
  if (!enabled || !uploaded.has(pageId) || !ids.length) return;
  const patch = {};
  for (const id of ids) patch[id] = null;
  write(fb.update(R(`pages/${pageId}/strokes`), patch));
}

/* 쪽을 지웠을 때 수업 방에서도 지웁니다. */
export function removePage(pageId) {
  if (!enabled) return;
  uploaded.delete(pageId);
  write(fb.remove(R(`pages/${pageId}`)));
}
