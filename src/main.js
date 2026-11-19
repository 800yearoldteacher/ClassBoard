import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { computeLayout } from './layout.js';
import { BoardCanvas } from './board/canvas.js';
import { COLORS, SIZES, paintStroke, redrawInk, toRecord, strokeBounds, union } from './board/ink.js';
import { attachInput } from './board/input.js';
import { strokesInLasso } from './board/lasso.js';
import { Laser } from './board/laser.js';
import { History } from './history.js';
import * as store from './store.js';
import { icon } from './ui/icons.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { buildToolbar, buildPagebar } from './ui/toolbar.js';
import { buildDrawer } from './ui/drawer.js';
import { openPopover, closePopover } from './ui/popover.js';
import { toast } from './ui/toast.js';

/* ---------- 상태 ---------- */
const prefs = loadPrefs();
const state = {
  lesson: null,
  page: null,
  strokes: [],   // 지금 쪽의 선(그린 순서대로)
  seq: 0,
};

/* ---------- 칠판 ---------- */
const boardEl = document.getElementById('board');
const board = new BoardCanvas(boardEl);
board.onRedrawInk = (ctx, w, h) => redrawInk(ctx, state.strokes, w, h);
const laser = new Laser(boardEl);
const history = new History();

/* ---------- 도구 ----------
   current: 지금 도구('pen' | 'eraser' | 'laser')
   last:    펜/지우개 버튼이 마지막으로 가리킨 도구. 레이저에서 돌아갈 때 씁니다. */
const tool = { current: 'pen', last: 'pen' };
const settings = { penAfterErase: true };   // 지운 뒤 펜 복귀(설정 화면은 1-4 묶음에서 만듭니다)

function setTool(t) {
  tool.current = t;
  if (t === 'pen' || t === 'eraser') tool.last = t;
  const penBtn = document.getElementById('tool-pen');
  penBtn.innerHTML = icon(tool.last === 'eraser' ? 'eraser' : 'pen');
  penBtn.setAttribute('aria-pressed', String(t !== 'laser'));
  penBtn.title = `펜/지우개: 지금 ${tool.last === 'eraser' ? '지우개' : '펜'}`;
  penBtn.classList.toggle('erasing', t === 'eraser');
  document.getElementById('tool-laser').setAttribute('aria-pressed', String(t === 'laser'));
  boardEl.classList.toggle('erasing', t === 'eraser');
}

function togglePen() {
  if (tool.current === 'laser') setTool(tool.last);   // 레이저에서 누르면 직전 도구로 돌아갑니다
  else setTool(tool.current === 'pen' ? 'eraser' : 'pen');
}
function toggleLaser() {
  if (tool.current === 'laser') setTool(tool.last);
  else setTool('laser');
}

/* ---------- 메뉴 ---------- */
function styleFor(pointerType) {
  const col = COLORS[prefs.colorIdx] || COLORS[0];
  return {
    tool: col.hl ? 'hl' : 'pen',
    color: col.c,
    w: (SIZES[prefs.sizeIdx] || SIZES[1]).w,
    sim: pointerType !== 'pen',
  };
}

function showColorOnButton() {
  const col = COLORS[prefs.colorIdx] || COLORS[0];
  const sw = document.querySelector('#tool-color .swatch');
  if (sw) {
    sw.style.setProperty('--c', col.swatch || col.c);
    sw.classList.toggle('hl', !!col.hl);
  }
  document.getElementById('tool-color').title = `색깔: ${col.name}`;
}
function showSizeOnButton() {
  document.getElementById('tool-width').title = `굵기: ${(SIZES[prefs.sizeIdx] || SIZES[1]).name}`;
}

function pickWidth(btn) {
  openPopover(btn, (el, close) => {
    el.classList.add('pop-list');
    SIZES.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pop-item' + (i === prefs.sizeIdx ? ' sel' : '');
      const px = Math.max(1.5, s.w * 1000);   // 미리보기 선 굵기
      b.innerHTML = `<svg viewBox="0 0 60 20" aria-hidden="true"><path d="M6 13 C 20 3, 36 17, 54 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${px}"/></svg><span>${s.name}</span>`;
      b.addEventListener('click', () => {
        prefs.sizeIdx = i; savePrefs(prefs); showSizeOnButton(); close();
      });
      el.append(b);
    });
  });
}

function pickColor(btn) {
  openPopover(btn, (el, close) => {
    el.classList.add('pop-grid');
    COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pop-swatch' + (i === prefs.colorIdx ? ' sel' : '');
      b.innerHTML = `<span class="dot${c.hl ? ' hl' : ''}" style="--c:${c.swatch || c.c}"></span><span>${c.name}</span>`;
      b.addEventListener('click', () => {
        prefs.colorIdx = i; savePrefs(prefs); showColorOnButton(); close();
      });
      el.append(b);
    });
  });
}

/* ---------- 선 넣기·빼기와 되돌리기 ---------- */
function saveError(e) {
  console.error(e);
  toast('판서를 저장하지 못했습니다. 저장 공간을 확인합니다.', { duration: 6000 });
}

function removeStrokes(list) {
  const ids = new Set(list.map((s) => s.id));
  state.strokes = state.strokes.filter((s) => !ids.has(s.id));
  board.redrawAll();
  store.deleteStrokes([...ids]).catch(saveError);
}
function addStrokes(list) {
  state.strokes = state.strokes.concat(list).sort((a, b) => a.seq - b.seq);
  board.redrawAll();
  store.putStrokes(list.map(toRecord)).catch(saveError);
}

function updateHistoryButtons() {
  const pid = state.page && state.page.id;
  for (const [id, can] of [['tool-undo', pid && history.canUndo(pid)], ['tool-redo', pid && history.canRedo(pid)]]) {
    const b = document.getElementById(id);
    b.setAttribute('aria-disabled', String(!can));
  }
}

function undo() {
  if (!state.page) return;
  const a = history.undo(state.page.id);
  if (!a) return;
  if (a.type === 'add') removeStrokes(a.strokes); else if (a.type === 'erase') addStrokes(a.strokes);
  updateHistoryButtons();
}
function redo() {
  if (!state.page) return;
  const a = history.redo(state.page.id);
  if (!a) return;
  if (a.type === 'add') addStrokes(a.strokes); else if (a.type === 'erase') removeStrokes(a.strokes);
  updateHistoryButtons();
}

/* 고리 지우개: 고리 안의 선을 한꺼번에 지웁니다. */
function eraseLasso(poly, box) {
  const hit = state.page ? strokesInLasso(state.strokes, poly) : [];
  if (!hit.length) { board.restoreRegion(box); return; }
  history.push(state.page.id, { type: 'erase', strokes: hit });
  removeStrokes(hit);   // 판서층을 다시 그리면서 고리 자국도 함께 지워집니다
  updateHistoryButtons();
  if (settings.penAfterErase) setTool('pen');
}

buildToolbar(document.getElementById('tools'), {
  'tool-pen': togglePen,
  'tool-laser': toggleLaser,
  'tool-width': pickWidth,
  'tool-color': pickColor,
  'tool-undo': undo,
  'tool-redo': redo,
});
buildPagebar(document.getElementById('pagebar'));
let lastLayout = null;
const drawer = buildDrawer({ onOpen: () => drawer.updateInfo(lastLayout, board, input.stats) });
showColorOnButton();
showSizeOnButton();
setTool('pen');
updateHistoryButtons();

/* ---------- 선 긋기와 저장 ---------- */
const input = attachInput({
  host: boardEl,
  board,
  laser,
  getMode: () => (tool.current === 'eraser' ? 'erase' : tool.current === 'laser' ? 'laser' : 'draw'),
  getStyle: styleFor,
  onErase: eraseLasso,
  onDown: closePopover,
  canFingerDraw: () => false,   // 손가락으로도 쓰기 설정은 1-4 묶음에서 만듭니다
  onCommit(st, box) {
    if (!state.page) { board.restoreRegion(box); return; }   // 아직 불러오는 중
    const t0 = performance.now();
    const s = { id: crypto.randomUUID(), pageId: state.page.id, seq: ++state.seq, ...st };
    state.strokes.push(s);
    if (s.tool === 'hl') {
      board.redrawAll();   // 형광 선은 글씨 아래에 깔리도록 판서층을 다시 그립니다
    } else {
      // 판서층에 완성 모양을 그리고, 미리보기 조각이 있던 구역만 바꿔 보입니다
      paintStroke(board.inkCtx, s, board.w, board.h);
      board.restoreRegion(union(box, strokeBounds(s, board.w, board.h)));
    }
    input.stats.commitMs = performance.now() - t0;
    history.push(state.page.id, { type: 'add', strokes: [s] });
    updateHistoryButtons();
    store.putStroke(toRecord(s)).catch(saveError);
  },
});

/* ---------- 화면 배치 ---------- */
let last = '';
function applyLayout() {
  const layout = computeLayout(window.innerWidth, window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  const key = `${layout.vw}x${layout.vh}@${dpr}`;
  if (key !== last) {
    last = key;
    closePopover();
    const s = document.documentElement.style;
    s.setProperty('--bx', `${layout.bx}px`);
    s.setProperty('--by', `${layout.by}px`);
    s.setProperty('--bw', `${layout.bw}px`);
    s.setProperty('--bh', `${layout.bh}px`);
    s.setProperty('--top', `${layout.top}px`);
    s.setProperty('--bottom', `${layout.bottom}px`);
    s.setProperty('--btn', `${Math.max(36, Math.min(52, Math.min(layout.top, layout.bottom) - 10))}px`);
    board.resize(layout.bw, layout.bh, dpr);
    laser.resize(layout.bw, layout.bh, dpr);
  }
  lastLayout = layout;
  drawer.updateInfo(layout, board, input.stats);
}

let pending = 0;
function scheduleLayout() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(applyLayout);
}
window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);
applyLayout();

/* ---------- 저장된 수업 불러오기 ---------- */
async function loadLesson() {
  let lesson = null;
  let page = null;
  const id = await store.getMeta('currentLessonId');
  if (id) lesson = await store.getLesson(id);
  if (lesson) {
    const pageId = (await store.getMeta('currentPageId')) || lesson.pageIds[0];
    page = await store.getPage(lesson.pageIds.includes(pageId) ? pageId : lesson.pageIds[0]);
  }
  if (!lesson || !page) ({ lesson, page } = await store.createLesson('새 수업'));
  state.lesson = lesson;
  state.page = page;
  state.strokes = await store.getStrokes(page.id);
  state.seq = state.strokes.reduce((m, s) => Math.max(m, s.seq), 0);
  board.redrawAll();
}

loadLesson().catch((e) => {
  console.error(e);
  toast('저장된 판서를 불러오지 못했습니다. 이번에 쓰는 판서는 저장되지 않을 수 있습니다.', { duration: 0 });
});
store.askPersist();

/* ---------- 브라우저 기본 동작 막기 ---------- */
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());   // 두 손가락 확대(일부 브라우저)

/* ---------- 설치형 앱 업데이트 ---------- */
const updateSW = registerSW({
  onNeedRefresh() {
    toast('새 판이 있습니다.', { action: { label: '새로 고침', onClick: () => updateSW(true) }, duration: 0 });
  },
  onOfflineReady() {
    toast('이제 인터넷 없이도 열립니다.');
  },
});
