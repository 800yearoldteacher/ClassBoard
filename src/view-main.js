/* 교실 PC 보기 화면(view.html#방코드)
   - 메뉴 없이 16:9 칠판만 화면에 꽉 차게 보여 줍니다. 읽기만 하고, 쓰지 않습니다.
   - 태블릿이 지금 보는 쪽의 배경·선과 확대 상태를 따라갑니다.
   - 화면을 한 번 누르면 전체화면이 됩니다(브라우저 규칙상 클릭이 필요합니다).
   - 구석에 연결 상태를 잠깐 보여 주고 숨깁니다. */

import './view.css';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, onChildAdded, onChildChanged, onChildRemoved } from 'firebase/database';
import { firebaseConfig, ROOM_RE, strokeFromRoom } from './room.js';
import { BoardCanvas } from './board/canvas.js';
import { redrawInk } from './board/ink.js';

const code = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const noticeEl = document.getElementById('notice');

function notice(html) {
  noticeEl.innerHTML = html || '';
  noticeEl.hidden = !html;
}

/* ---------- 칠판 ---------- */
const board = new BoardCanvas(boardEl);
const strokes = new Map();   // 지금 쪽의 선
board.onRedrawInk = (ctx, w, h) => redrawInk(ctx, [...strokes.values()].sort((a, b) => a.seq - b.seq), w, h);

let redrawPending = 0;
function redrawSoon() {
  if (redrawPending) return;
  redrawPending = requestAnimationFrame(() => { redrawPending = 0; board.redrawAll(); });
}

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = Math.floor(Math.min(vw, (vh * 16) / 9));
  const bh = Math.floor((bw * 9) / 16);
  const s = document.documentElement.style;
  s.setProperty('--bx', `${Math.floor((vw - bw) / 2)}px`);
  s.setProperty('--by', `${Math.floor((vh - bh) / 2)}px`);
  s.setProperty('--bw', `${bw}px`);
  s.setProperty('--bh', `${bh}px`);
  board.resize(bw, bh, window.devicePixelRatio || 1);
}
window.addEventListener('resize', layout);
layout();

/* ---------- 연결 상태 ---------- */
let fadeTimer = 0;
function showStatus(text, color, fade) {
  statusEl.textContent = text;
  statusEl.style.setProperty('--dot', color);
  statusEl.classList.remove('fade');
  clearTimeout(fadeTimer);
  if (fade) fadeTimer = setTimeout(() => statusEl.classList.add('fade'), 4000);
}

/* ---------- 전체화면 ---------- */
document.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (_) { /* 막히면 그대로 둡니다 */ }
  try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (_) { /* 화면 꺼짐 방지는 되는 브라우저에서만 */ }
});

/* ---------- 수업 방 따라가기 ---------- */
if (!ROOM_RE.test(code)) {
  notice('보기 주소가 올바르지 않습니다.<small>태블릿 서랍의 공유 → 보기 주소 복사로 받은 주소를 엽니다.</small>');
  showStatus('주소 확인 필요', '#ff6b6b', false);
} else {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const base = `rooms/${code}`;

  onValue(ref(db, '.info/connected'), (s) => {
    if (s.val() === true) showStatus('연결됨', '#3ecf8e', true);
    else showStatus('다시 연결 중', '#f5b942', false);
  });

  let pageId = null;
  let offPage = [];

  function followPage(id) {
    for (const off of offPage) off();
    offPage = [];
    strokes.clear();
    redrawSoon();
    pageId = id;
    if (!id) return;
    const sref = ref(db, `${base}/pages/${id}/strokes`);
    offPage.push(onChildAdded(sref, (s) => { strokes.set(s.key, strokeFromRoom(s.key, s.val())); redrawSoon(); }));
    offPage.push(onChildChanged(sref, (s) => { strokes.set(s.key, strokeFromRoom(s.key, s.val())); redrawSoon(); }));
    offPage.push(onChildRemoved(sref, (s) => { strokes.delete(s.key); redrawSoon(); }));
  }

  let bgKey = '';
  onValue(ref(db, `${base}/state`), (snap) => {
    const st = snap.val();
    if (!st) {
      notice('태블릿에서 PC 공유를 켜면 판서가 여기에 나타납니다.');
      followPage(null);
      return;
    }
    if (st.sharing === false) {
      // 지난 판서가 안내 뒤에 남아 보이지 않게 빈 칠판으로 둡니다
      notice('PC 공유가 꺼져 있습니다.<small>태블릿 서랍의 공유에서 PC 공유를 켭니다.</small>');
      followPage(null);
      bgKey = '';
      board.setBackground({ type: 'chalk' });
      board.compose();
      return;
    }
    notice('');
    const bg = st.bg || { type: 'chalk' };
    const key = JSON.stringify(bg);
    if (key !== bgKey) { bgKey = key; board.setBackground(bg); }
    const v = st.view || { z: 1, x: 0, y: 0 };
    const sameView = v.z === board.view.z && v.x === board.view.x && v.y === board.view.y;
    if (!sameView) board.setView(v);
    if (st.pageId !== pageId) followPage(st.pageId);
    else redrawSoon();
  });
}
