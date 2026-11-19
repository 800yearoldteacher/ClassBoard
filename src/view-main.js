/* 교실 PC 보기 화면(view.html#방코드)
   - 메뉴 없이 16:9 칠판만 화면에 꽉 차게 보여 줍니다. 읽기만 하고, 쓰지 않습니다.
   - 태블릿이 지금 보는 쪽의 배경·선과 확대 상태를 따라갑니다.
   - 화면을 한 번 누르면 전체화면이 됩니다(브라우저 규칙상 클릭이 필요합니다).
   - 구석에 연결 상태를 잠깐 보여 주고 숨깁니다. */

import './view.css';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, onChildAdded, onChildChanged, onChildRemoved } from 'firebase/database';
import { firebaseConfig, ROOM_RE, strokeFromRoom, decodePts } from './room.js';
import { BoardCanvas } from './board/canvas.js';
import { redrawInk, previewWidth, previewColor } from './board/ink.js';
import { baseColor } from './board/backgrounds.js';
import { Laser } from './board/laser.js';

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

const laser = new Laser(boardEl, () => board.view);

/* ---------- 태블릿이 긋고 있는 선 ----------
   태블릿이 0.05초마다 보내는 점 묶음을 받아 진행 중 층에 짧은 조각으로 덧그립니다(태블릿 미리보기와 같은 방식).
   진행 중 층을 다시 채울 때(compose)마다 아직 긋고 있는 선을 다시 얹습니다. */
const liveLines = new Map();   // id → { st, color, pts }

function drawLiveSegs(L, pts) {
  const ctx = board.liveCtx;
  if (!ctx) return;
  const z = board.view.z;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.strokeStyle = L.color;
  for (const q of pts) {
    const prev = L.pts.length ? L.pts[L.pts.length - 1] : q;
    const [x0, y0] = board.toScreen(prev[0], prev[1]);
    const [x1, y1] = board.toScreen(q[0], q[1]);
    ctx.lineWidth = previewWidth(L.st, (prev[2] + q[2]) / 2, board.w) * z;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    L.pts.push(q);
  }
}
function redrawLiveLines() {
  for (const L of liveLines.values()) {
    const pts = L.pts;
    L.pts = [];
    drawLiveSegs(L, pts);
  }
}
const compose = board.compose.bind(board);
board.compose = () => { compose(); redrawLiveLines(); };

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
  laser.resize(bw, bh, window.devicePixelRatio || 1);
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

  /* 쪽 배경: 사진·PDF 쪽은 태블릿이 올린 그림(bg.img)을 풀어 그립니다. 그림이 오기 전에는 칠판색입니다. */
  let bgKey = '';
  async function applyBackground(id, bg) {
    const key = `${id}|${bg.type}|${bg.img ? bg.img.length : 0}`;
    if (key === bgKey) return;
    bgKey = key;
    let pic = null;
    if (bg.img) {
      try {
        const im = new Image();
        im.src = bg.img;
        await im.decode();
        pic = await createImageBitmap(im);
      } catch (e) { console.error(e); }
    }
    if (pageId !== id || bgKey !== key) return;   // 그사이 쪽이 바뀌었으면 버립니다
    board.setBackground({ type: bg.type }, pic);
    board.compose();
  }

  function followPage(id) {
    for (const off of offPage) off();
    offPage = [];
    strokes.clear();
    redrawSoon();
    pageId = id;
    if (!id) return;
    offPage.push(onValue(ref(db, `${base}/pages/${id}/bg`), (s) => applyBackground(id, s.val() || { type: 'chalk' })));
    const sref = ref(db, `${base}/pages/${id}/strokes`);
    offPage.push(onChildAdded(sref, (s) => { strokes.set(s.key, strokeFromRoom(s.key, s.val())); redrawSoon(); }));
    offPage.push(onChildChanged(sref, (s) => { strokes.set(s.key, strokeFromRoom(s.key, s.val())); redrawSoon(); }));
    offPage.push(onChildRemoved(sref, (s) => { strokes.delete(s.key); redrawSoon(); }));
  }

  /* 긋고 있는 선: live/{id} = { color, w, tool, sim, c: { 번호: 점 묶음 } } */
  onChildAdded(ref(db, `${base}/live`), (s) => {
    const v = s.val() || {};
    const st = { color: v.color || '#fff', w: v.w || 0.004, tool: v.tool || 'pen', sim: !!v.sim };
    const L = { st, color: previewColor(st, baseColor(board.background)), pts: [], off: null };
    liveLines.set(s.key, L);
    L.off = onChildAdded(ref(db, `${base}/live/${s.key}/c`), (cs) => drawLiveSegs(L, decodePts(cs.val())));
  });
  onChildRemoved(ref(db, `${base}/live`), (s) => {
    const L = liveLines.get(s.key);
    if (L) { L.off(); liveLines.delete(s.key); }
    redrawSoon();   // 완성된 선이 먼저 도착해 있으므로 다시 그리면 자국 없이 바뀝니다
  });

  /* 레이저: laser/{id} = { c: { 번호: 점 묶음 }, done } */
  const lasers = new Map();
  onChildAdded(ref(db, `${base}/laser`), (s) => {
    const offs = [];
    let first = true;
    offs.push(onChildAdded(ref(db, `${base}/laser/${s.key}/c`), (cs) => {
      for (const q of decodePts(cs.val())) {
        if (first) { laser.begin(q); first = false; } else laser.add(q);
      }
    }));
    offs.push(onValue(ref(db, `${base}/laser/${s.key}/done`), (d) => { if (d.val()) laser.end(); }));
    lasers.set(s.key, offs);
  });
  onChildRemoved(ref(db, `${base}/laser`), (s) => {
    for (const off of lasers.get(s.key) || []) off();
    lasers.delete(s.key);
    laser.end();
  });

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
    const v = st.view || { z: 1, x: 0, y: 0 };
    const sameView = v.z === board.view.z && v.x === board.view.x && v.y === board.view.y;
    if (!sameView) board.setView(v);
    if (st.pageId !== pageId) followPage(st.pageId);
    else redrawSoon();
  });
}
