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
import { openModal, confirmModal, textModal, pinModal, listModal } from './ui/modal.js';
import { hashPin } from './lock.js';

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

/* 설정(태블릿 안 meta 저장소에 보관) */
const settings = {
  fingerDraw: false,      // 손가락으로도 쓰기
  penAfterErase: true,    // 지운 뒤 펜 복귀
  lockHash: null,         // 잠금 번호 해시(없으면 잠금 꺼짐)
};
function saveSettings() { store.setMeta('settings', { ...settings }).catch(saveError); }

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

/* ---------- 쪽 ---------- */
let busy = false;   // 쪽·수업을 불러오는 동안 겹쳐 누르지 않게 합니다

function pageIndex() {
  return state.lesson && state.page ? state.lesson.pageIds.indexOf(state.page.id) : -1;
}
function updatePageBar() {
  const i = pageIndex();
  const n = state.lesson ? state.lesson.pageIds.length : 1;
  document.querySelector('#page-count .count').textContent = `${i + 1} / ${n}`;
  document.getElementById('page-count').title = `쪽 관리 (${i + 1}쪽 / 전체 ${n}쪽)`;
  document.getElementById('page-prev').setAttribute('aria-disabled', String(i <= 0));
  document.getElementById('page-next').setAttribute('aria-disabled', String(i < 0 || i >= n - 1));
}

async function showPage(pageId) {
  const page = await store.getPage(pageId);
  if (!page) throw new Error('쪽을 찾지 못했습니다.');
  const strokes = await store.getStrokes(page.id);
  laser.clear();
  state.page = page;
  state.strokes = strokes;
  state.seq = strokes.reduce((m, s) => Math.max(m, s.seq), 0);
  board.redrawAll();
  updatePageBar();
  updateHistoryButtons();
  store.setMeta('currentPageId', page.id).catch(() => {});
}

async function guarded(fn) {
  if (busy || input.drawing) return;
  busy = true;
  try { await fn(); } catch (e) { console.error(e); toast('처리하지 못했습니다. 다시 시도합니다.'); } finally { busy = false; }
}

function goPage(delta) {
  return guarded(async () => {
    const i = pageIndex() + delta;
    if (i < 0 || i >= state.lesson.pageIds.length) return;
    await showPage(state.lesson.pageIds[i]);
  });
}

/* 지금 쪽 바로 뒤에 같은 배경의 빈 쪽을 넣습니다. */
function addPage() {
  return guarded(async () => {
    const i = pageIndex();
    const { lesson, page } = await store.insertPage(state.lesson, i + 1, state.page.bg);
    state.lesson = lesson;
    await showPage(page.id);
    toast(`${i + 2}쪽을 새로 넣었습니다.`);
  });
}

/* ---------- 수업 파일 ---------- */
async function openLesson(id, pageId = null) {
  const lesson = await store.getLesson(id);
  if (!lesson) throw new Error('수업을 찾지 못했습니다.');
  state.lesson = lesson;
  await store.setMeta('currentLessonId', lesson.id);
  await showPage(pageId && lesson.pageIds.includes(pageId) ? pageId : lesson.pageIds[0]);
  drawer.refresh();
}

function defaultTitle() {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 수업`;
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function newLesson() {
  const title = await textModal({ title: '새 수업', message: '수업 이름을 정합니다. 지금 수업은 그대로 저장되어 있습니다.', value: defaultTitle(), ok: '만들기' });
  if (!title) return;
  await guarded(async () => {
    const { lesson } = await store.createLesson(title);
    await openLesson(lesson.id);
    drawer.close();
    toast(`'${title}' 수업을 만들었습니다.`);
  });
}

async function chooseLesson() {
  const lessons = await store.listLessons();
  const id = await listModal({
    title: '수업 열기',
    items: lessons.map((l) => ({
      label: l.title,
      sub: `${l.pageIds.length}쪽 · 마지막 수정 ${new Date(l.updatedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${state.lesson && l.id === state.lesson.id ? ' · 지금 연 수업' : ''}`,
      value: l.id,
      current: state.lesson && l.id === state.lesson.id,
    })),
  });
  if (!id || (state.lesson && id === state.lesson.id)) return;
  await guarded(async () => {
    await openLesson(id);
    drawer.close();
  });
}

async function renameLesson() {
  const title = await textModal({ title: '수업 이름 바꾸기', value: state.lesson.title, ok: '바꾸기' });
  if (!title || title === state.lesson.title) return;
  state.lesson = { ...state.lesson, title };
  await store.putLesson(state.lesson);
}

async function clearPage() {
  if (!state.strokes.length) { toast('이 쪽에는 지울 판서가 없습니다.'); return; }
  const ok = await confirmModal({
    title: '이 쪽 모두 지우기',
    message: `이 쪽의 선 ${state.strokes.length}개를 모두 지웁니다. 되돌리기로 다시 살릴 수 있습니다.`,
    ok: '모두 지우기',
    danger: true,
  });
  if (!ok) return;
  const all = state.strokes.slice();
  history.push(state.page.id, { type: 'erase', strokes: all });
  removeStrokes(all);
  updateHistoryButtons();
  drawer.close();
}

/* ---------- 설정 잠금 ---------- */
let unlocked = false;   // 서랍을 닫으면 다시 잠깁니다

async function ensureUnlocked() {
  if (!settings.lockHash || unlocked) return true;
  const pin = await pinModal({ title: '잠금 번호', message: '잠금 번호 네 자리를 누릅니다.' });
  if (pin === null) return false;
  if (await hashPin(pin) === settings.lockHash) { unlocked = true; return true; }
  toast('잠금 번호가 맞지 않습니다.');
  return false;
}
const locked = (fn) => async () => { if (await ensureUnlocked()) await fn(); };

async function askNewPin() {
  const first = await pinModal({ title: '새 잠금 번호', message: '새 잠금 번호 네 자리를 누릅니다.' });
  if (first === null) return;
  const again = await pinModal({ title: '새 잠금 번호 확인', message: '같은 번호를 한 번 더 누릅니다.' });
  if (again === null) return;
  if (first !== again) { toast('두 번 누른 번호가 달라 바꾸지 않았습니다.'); return; }
  settings.lockHash = await hashPin(first);
  unlocked = true;
  saveSettings();
  toast('잠금 번호를 정했습니다. 수업과 설정 메뉴를 쓸 때 이 번호를 묻습니다.', { duration: 5000 });
}

async function lockMenu() {
  if (!settings.lockHash) { await askNewPin(); return; }
  await new Promise((resolve) => {
    openModal({
      title: '잠금 번호',
      message: '잠금 번호가 켜져 있습니다. 수업과 설정 메뉴를 쓸 때 번호를 묻습니다.',
      onCancel: resolve,
      actions: [
        { label: '닫기', cancel: true },
        { label: '잠금 끄기', danger: true, onClick: () => { settings.lockHash = null; saveSettings(); toast('잠금을 껐습니다.'); resolve(); } },
        { label: '번호 바꾸기', primary: true, onClick: () => { askNewPin().then(resolve); } },
      ],
    });
  });
}

function toggleSetting(key, onText, offText) {
  return () => {
    settings[key] = !settings[key];
    saveSettings();
    toast(settings[key] ? onText : offText);
  };
}

/* ---------- 메뉴 만들기 ---------- */
buildToolbar(document.getElementById('tools'), {
  'tool-pen': togglePen,
  'tool-laser': toggleLaser,
  'tool-width': pickWidth,
  'tool-color': pickColor,
  'tool-undo': undo,
  'tool-redo': redo,
});
buildPagebar(document.getElementById('pagebar'), {
  'page-prev': () => goPage(-1),
  'page-next': () => goPage(1),
  'page-add': addPage,
});
let lastLayout = null;
const drawer = buildDrawer({
  onOpen: () => drawer.updateInfo(lastLayout, board, input.stats),
  onClose: () => { unlocked = false; },
  sections: [
    { title: '자료', items: [
      { label: 'PDF 열기', later: 's3' },
      { label: '이미지 불러오기', later: 's3' },
      { label: '카메라 촬영', later: 's3' },
      { label: '배경 바꾸기', later: 's2' },
    ] },
    { title: '공유', items: [
      { label: 'PC 공유 켜기', later: 's4' },
    ] },
    { title: '수업',
      intro: () => (state.lesson
        ? `지금 수업: <strong>${escapeHtml(state.lesson.title)}</strong> <small>(${state.lesson.pageIds.length}쪽)</small>`
        : '수업을 불러오는 중입니다.'),
      items: [
        { label: '새 수업', onClick: locked(newLesson) },
        { label: '수업 열기', onClick: locked(chooseLesson) },
        { label: '수업 이름 바꾸기', onClick: locked(renameLesson) },
        { label: '이 쪽 모두 지우기', onClick: locked(clearPage) },
        { label: '수업 종료', later: 's4' },
      ] },
    { title: '설정', items: [
      { label: '잠금 번호', toggle: () => !!settings.lockHash, onClick: locked(lockMenu) },
      { label: '손가락으로도 쓰기', toggle: () => settings.fingerDraw,
        onClick: locked(toggleSetting('fingerDraw', '손가락으로도 쓸 수 있습니다.', '펜을 쓴 뒤에는 손가락으로 쓰지 않습니다.')) },
      { label: '지운 뒤 펜 복귀', toggle: () => settings.penAfterErase,
        onClick: locked(toggleSetting('penAfterErase', '한 번 지우면 펜으로 돌아갑니다.', '지운 뒤에도 지우개로 남습니다.')) },
    ] },
  ],
});
showColorOnButton();
showSizeOnButton();
setTool('pen');
updateHistoryButtons();
updatePageBar();

/* ---------- 선 긋기와 저장 ---------- */
const input = attachInput({
  host: boardEl,
  board,
  laser,
  getMode: () => (tool.current === 'eraser' ? 'erase' : tool.current === 'laser' ? 'laser' : 'draw'),
  getStyle: styleFor,
  onErase: eraseLasso,
  onDown: closePopover,
  canFingerDraw: () => settings.fingerDraw,
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
    // 수업 목록의 '마지막 수정' 시각은 30초에 한 번만 고칩니다
    if (Date.now() - state.lesson.updatedAt > 30000) {
      state.lesson = { ...state.lesson, updatedAt: Date.now() };
      store.putLesson(state.lesson).catch(saveError);
    }
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
async function start() {
  Object.assign(settings, (await store.getMeta('settings')) || {});
  const id = await store.getMeta('currentLessonId');
  const lesson = id ? await store.getLesson(id) : null;
  if (lesson) {
    await openLesson(lesson.id, await store.getMeta('currentPageId'));
  } else {
    const created = await store.createLesson(defaultTitle());
    await openLesson(created.lesson.id);
  }
}

start().catch((e) => {
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
