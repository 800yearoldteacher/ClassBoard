import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { computeLayout } from './layout.js';
import { BoardCanvas } from './board/canvas.js';
import { COLORS, SIZES, paintStroke, redrawInk, toRecord, strokeBounds, union } from './board/ink.js';
import { attachInput } from './board/input.js';
import { strokesInLasso } from './board/lasso.js';
import { Laser } from './board/laser.js';
import { Selection } from './board/select.js';
import { attachView } from './board/view.js';
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
import { openPageManager } from './ui/pages.js';
import { BG_TYPES, paintBackground, isDark, bgName } from './board/backgrounds.js';
import * as media from './media.js';
import * as share from './share.js';

/* ---------- 상태 ---------- */
const prefs = loadPrefs();
const state = {
  lesson: null,
  page: null,
  strokes: [],   // 지금 쪽의 선(그린 순서대로)
  seq: 0,
  hidden: null,  // 옮기는 동안 판서층에서 잠시 빼 둘 선 id
};

/* ---------- 칠판 ---------- */
const boardEl = document.getElementById('board');
const board = new BoardCanvas(boardEl);
board.onRedrawInk = (ctx, w, h) => redrawInk(
  ctx,
  state.hidden ? state.strokes.filter((s) => !state.hidden.has(s.id)) : state.strokes,
  w, h,
);
const laser = new Laser(boardEl, () => board.view);
const history = new History();
const selection = new Selection(boardEl, board, { onDelete: deleteSelected });

/* ---------- 도구 ----------
   current: 지금 도구('pen' | 'eraser' | 'laser' | 'select')
   last:    펜/지우개 버튼이 마지막으로 가리킨 도구. 레이저·선택에서 돌아갈 때 씁니다. */
const tool = { current: 'pen', last: 'pen' };

/* 설정(태블릿 안 meta 저장소에 보관) */
const settings = {
  penAfterErase: true,    // 지운 뒤 펜 복귀
  lockHash: null,         // 잠금 번호 해시(없으면 잠금 꺼짐)
};
function saveSettings() { store.setMeta('settings', { ...settings }).catch(saveError); }

function setTool(t) {
  tool.current = t;
  if (t === 'pen' || t === 'eraser') tool.last = t;
  const penBtn = document.getElementById('tool-pen');
  penBtn.innerHTML = icon(tool.last === 'eraser' ? 'eraser' : 'pen');
  penBtn.setAttribute('aria-pressed', String(t === 'pen' || t === 'eraser'));
  penBtn.title = `펜/지우개: 지금 ${tool.last === 'eraser' ? '지우개' : '펜'}`;
  penBtn.classList.toggle('erasing', t === 'eraser');
  document.getElementById('tool-laser').setAttribute('aria-pressed', String(t === 'laser'));
  document.getElementById('tool-select').setAttribute('aria-pressed', String(t === 'select'));
  boardEl.classList.toggle('erasing', t === 'eraser');
  document.getElementById('tool-clear').hidden = t !== 'eraser';   // ALL 버튼은 지우개일 때만
  if (t !== 'select') selection.clear();
}

function togglePen() {
  // 레이저·선택에서 누르면 직전 도구(펜 또는 지우개)로 돌아갑니다
  if (tool.current === 'laser' || tool.current === 'select') setTool(tool.last);
  else setTool(tool.current === 'pen' ? 'eraser' : 'pen');
}
function toggleLaser() {
  if (tool.current === 'laser') setTool(tool.last);
  else setTool('laser');
}
function toggleSelect() {
  if (tool.current === 'select') setTool(tool.last);
  else setTool('select');
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
  document.getElementById('tool-width').title = `굵기: ${(SIZES[prefs.sizeIdx] || SIZES[1]).name}${prefs.pressure === false ? ' (필압 끔)' : ''}`;
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
    // 필압 반영: 끄면 S펜을 세게 누르든 약하게 누르든 같은 굵기로 씁니다
    const row = document.createElement('label');
    row.className = 'pop-check';
    row.innerHTML = '<input type="checkbox"><span>필압 반영<small>누르는 힘에 따라 굵기가 달라집니다</small></span>';
    const box = row.querySelector('input');
    box.checked = prefs.pressure !== false;
    box.addEventListener('change', () => {
      prefs.pressure = box.checked;
      savePrefs(prefs);
      showSizeOnButton();
      toast(box.checked ? '필압을 반영합니다.' : '필압을 반영하지 않고 같은 굵기로 씁니다.');
    });
    el.append(row);
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
  share.removeStrokes(state.page.id, [...ids]);
}
function addStrokes(list) {
  state.strokes = state.strokes.concat(list).sort((a, b) => a.seq - b.seq);
  board.redrawAll();
  store.putStrokes(list.map(toRecord)).catch(saveError);
  share.putStrokes(state.page.id, list);
}

function updateHistoryButtons() {
  const pid = state.page && state.page.id;
  for (const [id, can] of [['tool-undo', pid && history.canUndo(pid)], ['tool-redo', pid && history.canRedo(pid)]]) {
    const b = document.getElementById(id);
    b.setAttribute('aria-disabled', String(!can));
  }
}

/* 선을 (dx, dy)만큼 옮깁니다(칠판 기준 비율). 옮기기와 그 되돌리기에 씁니다. */
const r5 = (n) => Math.round(n * 1e5) / 1e5;
function moveStrokes(list, dx, dy) {
  for (const s of list) {
    s.pts = s.pts.map((p) => [r5(p[0] + dx), r5(p[1] + dy), p[2]]);
    s._path = null; s._key = null; s._bb = null;   // 모양·범위를 다시 계산하게 합니다
  }
  board.redrawAll();
  store.putStrokes(list.map(toRecord)).catch(saveError);
  share.putStrokes(state.page.id, list);
}

function undo() {
  if (!state.page || input.drawing) return;
  const a = history.undo(state.page.id);
  if (!a) return;
  selection.clear();
  if (a.type === 'add') removeStrokes(a.strokes);
  else if (a.type === 'erase') addStrokes(a.strokes);
  else if (a.type === 'move') moveStrokes(a.strokes, -a.dx, -a.dy);
  updateHistoryButtons();
}
function redo() {
  if (!state.page || input.drawing) return;
  const a = history.redo(state.page.id);
  if (!a) return;
  selection.clear();
  if (a.type === 'add') addStrokes(a.strokes);
  else if (a.type === 'erase') removeStrokes(a.strokes);
  else if (a.type === 'move') moveStrokes(a.strokes, a.dx, a.dy);
  updateHistoryButtons();
}

/* 지우개 옆 ALL 버튼: 이 쪽의 선을 모두 지웁니다. 되돌리기로 살릴 수 있어 따로 묻지 않습니다. */
function eraseAll() {
  if (!state.page || input.drawing) return;
  if (!state.strokes.length) { toast('이 쪽에는 지울 판서가 없습니다.'); return; }
  const all = state.strokes.slice();
  selection.clear();
  history.push(state.page.id, { type: 'erase', strokes: all });
  removeStrokes(all);
  updateHistoryButtons();
  toast('이 쪽을 모두 지웠습니다. 되돌리기로 살릴 수 있습니다.');
  if (settings.penAfterErase) setTool('pen');
}

/* ---------- 선택 ---------- */
function deleteSelected(list) {
  if (!list.length || !state.page) return;
  history.push(state.page.id, { type: 'erase', strokes: list });
  selection.clear();
  removeStrokes(list);
  updateHistoryButtons();
}

const selectHooks = {
  /* 상자 안을 누르면 옮기기, 밖이면 새로 묶기 */
  down(q) {
    if (selection.active && selection.contains(q)) {
      state.hidden = new Set(selection.strokes.map((s) => s.id));
      board.redrawAll();          // 묶인 선을 판서층에서 잠시 뺍니다
      selection.beginMove();
      return 'move';
    }
    selection.clear();
    return 'pick';
  },
  move(dx, dy) { selection.moveTo(dx, dy); },
  end(cancelled) {
    const { dx, dy } = selection.endMove();
    const list = selection.strokes.slice();
    state.hidden = null;
    if (!cancelled && (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5)) {
      moveStrokes(list, dx, dy);
      history.push(state.page.id, { type: 'move', strokes: list, dx, dy });
      updateHistoryButtons();
    } else {
      board.redrawAll();
    }
    selection.set(list);   // 옮긴 자리에서 계속 선택해 둡니다
  },
  pick(poly, box) {
    board.restoreRegion(box);   // 파란 고리 자국을 지웁니다
    const hit = state.page ? strokesInLasso(state.strokes, poly) : [];
    if (hit.length) selection.set(hit);
  },
};

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
  const picture = await media.bitmapFor(page.bg, boardPixels());
  laser.clear();
  selection.clear();
  state.page = page;
  state.strokes = strokes;
  state.seq = strokes.reduce((m, s) => Math.max(m, s.seq), 0);
  board.resetView();   // 쪽을 넘기면 원래 크기로 돌아갑니다
  updateZoomButton();
  board.setBackground(page.bg, picture);
  board.redrawAll();
  matchPenToBackground();
  prefetchNeighbors();
  share.showPage(page, strokes, board.view);
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
    // 사진·PDF 쪽 뒤에 넣는 빈 쪽은 칠판으로 합니다(사진을 그대로 베끼지 않습니다)
    const bg = ['image', 'pdf'].includes(state.page.bg.type) ? { type: 'chalk' } : state.page.bg;
    const { lesson, page } = await store.insertPage(state.lesson, i + 1, bg);
    state.lesson = lesson;
    await showPage(page.id);
    toast(`${i + 2}쪽을 새로 넣었습니다.`);
  });
}

/* ---------- 배경 ---------- */
/* 기본 색 규칙: 칠판 배경이면 흰색, 밝은 배경이면 검정(계획서 6-2절).
   지금 펜 색이 흰색인데 밝은 배경이면 검정으로, 검정인데 칠판이면 흰색으로 바꿉니다. 다른 색은 그대로 둡니다. */
const WHITE_IDX = 0, BLACK_IDX = 1;
function matchPenToBackground() {
  const dark = isDark(state.page && state.page.bg);
  const want = dark ? WHITE_IDX : BLACK_IDX;
  const other = dark ? BLACK_IDX : WHITE_IDX;
  if (prefs.colorIdx === other) {
    prefs.colorIdx = want;
    savePrefs(prefs);
    showColorOnButton();
  }
}

async function pickBackground() {
  if (!state.page) return;
  const chosen = await new Promise((resolve) => {
    openModal({
      title: '배경 바꾸기',
      message: '지금 쪽의 배경을 고릅니다. 새로 넣는 쪽은 지금 쪽의 배경을 따릅니다.',
      onCancel: () => resolve(null),
      build(body, close) {
        const grid = document.createElement('div');
        grid.className = 'bg-grid';
        for (const b of BG_TYPES) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bg-item' + (b.type === state.page.bg.type ? ' sel' : '');
          const cv = document.createElement('canvas');
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          cv.width = 160 * dpr; cv.height = 90 * dpr;
          const ctx = cv.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          paintBackground(ctx, { type: b.type }, 160, 90);
          const label = document.createElement('span');
          label.textContent = b.name;
          btn.append(cv, label);
          btn.addEventListener('click', () => { close(); resolve(b.type); });
          grid.append(btn);
        }
        body.append(grid);
      },
      actions: [{ label: '닫기', cancel: true }],
    });
  });
  if (!chosen || chosen === state.page.bg.type) return;
  const oldAsset = state.page.bg.assetId;
  state.page = { ...state.page, bg: { type: chosen } };
  board.setBackground(state.page.bg);
  board.compose();
  matchPenToBackground();
  drawer.close();
  store.putPage(state.page).then(() => store.dropAssetIfUnused(oldAsset)).catch(saveError);
  share.setBackground(state.page);
  toast(`배경을 ${bgName(state.page.bg)}으로 바꿨습니다.`);   // 다섯 이름 모두 받침으로 끝나 '으로'를 씁니다
}

/* ---------- 전체화면 ----------
   브라우저 주소창과 상태 표시줄을 숨깁니다. 태블릿 설치 앱은 처음부터 전체화면이라 주로 교실 PC·전자칠판에서 씁니다. */
function isFullscreen() { return !!document.fullscreenElement; }

function showFullscreenButton() {
  const b = document.getElementById('page-fullscreen');
  const on = isFullscreen();
  b.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
  b.title = on ? '전체화면 끝내기' : '전체화면';
  b.setAttribute('aria-label', b.title);
}

async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await document.exitFullscreen();
    } else if (window.matchMedia('(display-mode: fullscreen)').matches) {
      toast('설치한 앱은 이미 전체화면입니다.');
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } else {
      toast('이 브라우저에서는 전체화면을 쓸 수 없습니다.');
    }
  } catch (e) {
    console.error(e);
    toast('전체화면으로 바꾸지 못했습니다.');
  }
}
document.addEventListener('fullscreenchange', showFullscreenButton);

/* 칠판의 실제 화소 크기(PDF 쪽을 이 크기에 맞춰 그립니다) */
function boardPixels() {
  return { w: Math.round(board.w * board.dpr) || 1920, h: Math.round(board.h * board.dpr) || 1080 };
}

/* 앞뒤 쪽이 PDF면 미리 그려 둡니다. */
async function prefetchNeighbors() {
  const i = pageIndex();
  for (const j of [i + 1, i - 1]) {
    const id = state.lesson.pageIds[j];
    if (!id) continue;
    const p = await store.getPage(id);
    if (p) media.prefetch(p.bg, boardPixels());
  }
}

/* 화면 크기가 바뀌면 PDF 쪽을 새 크기로 다시 그립니다(그동안은 늘린 그림을 씁니다). */
async function refreshPictureForSize() {
  const page = state.page;
  if (!page || page.bg.type !== 'pdf') return;
  const pic = await media.bitmapFor(page.bg, boardPixels());
  if (state.page !== page) return;
  board.setBackground(page.bg, pic);
  board.compose();
}

/* ---------- PDF ----------
   PDF를 고르면 쪽 범위를 묻고, 고른 쪽들을 지금 쪽 뒤에 차례로 넣습니다. */
function parseRange(text, max) {
  const t = text.replace(/\s/g, '').replace(/[~∼〜–—]/g, '-');
  if (!t) return Array.from({ length: max }, (_, i) => i + 1);
  const out = [];
  for (const part of t.split(/[,，]/)) {
    if (!part) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    let a = Number(m[1]), b = Number(m[2] || m[1]);
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > max) return null;
    for (let k = a; k <= b; k++) out.push(k);
  }
  return out.length ? out : null;
}

function describeRange(list) {
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    parts.push(i === j ? `${list[i]}` : `${list[i]}~${list[j]}`);
    i = j;
  }
  return parts.join(', ');
}

async function openPdf() {
  const [file] = await pickFiles({ accept: 'application/pdf,.pdf' });
  if (!file) return;
  drawer.close();
  let info;
  try {
    toast('PDF를 여는 중입니다…', { duration: 0 });
    info = await media.importPdf(file);
    toast(`PDF를 열었습니다. 전체 ${info.pages}쪽입니다.`);
  } catch (e) {
    console.error(e);
    toast('PDF를 열지 못했습니다. 파일이 손상되었거나 암호가 걸려 있을 수 있습니다.', { duration: 6000 });
    return;
  }
  let list = null;
  for (;;) {
    const text = await textModal({
      title: 'PDF 쪽 고르기',
      message: `${info.name} · 전체 ${info.pages}쪽. 가져올 쪽을 적습니다. 예: 12-15, 20 (비우면 전체)`,
      value: info.pages <= 30 ? `1-${info.pages}` : '',
      ok: '가져오기',
      allowEmpty: true,
    });
    if (text === null) { store.dropAssetIfUnused(info.assetId).catch(() => {}); return; }
    list = parseRange(text, info.pages);
    if (list) break;
    toast(`쪽 번호를 1부터 ${info.pages} 사이로, '12-15, 20'처럼 적습니다.`, { duration: 5000 });
  }
  if (list.length > 100 && !(await confirmModal({
    title: '많은 쪽 가져오기',
    message: `${list.length}쪽을 가져옵니다. 쪽 관리 창이 길어질 수 있습니다. 계속합니까?`,
    ok: '가져오기',
  }))) { store.dropAssetIfUnused(info.assetId).catch(() => {}); return; }

  await guarded(async () => {
    const start = pageIndex() + 1;
    const bgs = list.map((n) => ({ type: 'pdf', assetId: info.assetId, pdfPage: n }));
    const { lesson, pages } = await store.insertPages(state.lesson, start, bgs);
    state.lesson = lesson;
    await showPage(pages[0].id);
    toast(`PDF ${describeRange(list)}쪽(${list.length}쪽)을 ${start + 1}쪽부터 넣었습니다.`, { duration: 5000 });
  });
}

/* ---------- 사진·카메라 ----------
   고른 사진마다 지금 쪽 뒤에 새 쪽을 하나씩 넣고, 사진을 배경으로 씁니다. */
function pickFiles({ accept, multiple = false, capture = null }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.addEventListener('change', () => resolve([...input.files]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

async function insertPictures(files) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  drawer.close();
  await guarded(async () => {
    const start = pageIndex() + 1;
    let firstId = null;
    toast(images.length > 1 ? `사진 ${images.length}장을 넣는 중입니다…` : '사진을 넣는 중입니다…', { duration: 0 });
    for (let i = 0; i < images.length; i++) {
      const assetId = await media.importImage(images[i]);
      const { lesson, page } = await store.insertPage(state.lesson, start + i, { type: 'image', assetId });
      state.lesson = lesson;
      if (!firstId) firstId = page.id;
    }
    await showPage(firstId);
    toast(images.length > 1 ? `사진 ${images.length}장을 ${start + 1}쪽부터 넣었습니다.` : `사진을 ${start + 1}쪽에 넣었습니다.`);
  });
}

async function importPictures() {
  insertPictures(await pickFiles({ accept: 'image/*', multiple: true }));
}
async function takePhoto() {
  // 태블릿 기본 카메라 앱이 열립니다(실물화상기 대용)
  insertPictures(await pickFiles({ accept: 'image/*', capture: 'environment' }));
}

/* ---------- 쪽 관리 창 ---------- */
const THUMB_W = 320, THUMB_H = 180;

async function drawThumb(pageId, canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const isCurrent = state.page && pageId === state.page.id;
  const page = isCurrent ? state.page : await store.getPage(pageId);
  // 지금 쪽은 화면용 선 모양 기억(_path)을 건드리지 않도록 복사해서 그립니다
  const strokes = isCurrent
    ? state.strokes.map((s) => ({ ...s, _path: null, _key: null }))
    : await store.getStrokes(pageId);
  paintBackground(ctx, page && page.bg, THUMB_W, THUMB_H, await media.bitmapFor(page && page.bg, { w: THUMB_W * dpr, h: THUMB_H * dpr }));
  for (const s of strokes) if (s.tool === 'hl') paintStroke(ctx, s, THUMB_W, THUMB_H);
  for (const s of strokes) if (s.tool !== 'hl') paintStroke(ctx, s, THUMB_W, THUMB_H);
}

async function removePage(pageId, n) {
  if (state.lesson.pageIds.length <= 1) return false;
  const ok = await confirmModal({
    title: `${n}쪽 지우기`,
    message: `${n}쪽과 그 쪽의 판서를 지웁니다. 지운 쪽은 되살릴 수 없습니다.`,
    ok: '쪽 지우기',
    danger: true,
  });
  if (!ok) return false;
  let removed = false;
  await guarded(async () => {
    const idx = state.lesson.pageIds.indexOf(pageId);
    const gone = await store.getPage(pageId);
    state.lesson = await store.deletePage(state.lesson, pageId);
    if (gone && gone.bg) store.dropAssetIfUnused(gone.bg.assetId).catch(() => {});
    history.forget(pageId);
    share.removePage(pageId);
    if (state.page.id === pageId) {
      await showPage(state.lesson.pageIds[Math.min(idx, state.lesson.pageIds.length - 1)]);
    } else {
      updatePageBar();
    }
    removed = true;
  });
  if (removed) toast(`${n}쪽을 지웠습니다.`);
  return removed;
}

function openPages() {
  if (!state.lesson || input.drawing) return;
  closePopover();
  openPageManager({
    getIds: () => state.lesson.pageIds,
    getCurrentId: () => state.page && state.page.id,
    drawThumb,
    go: (id) => (id === state.page.id ? Promise.resolve() : guarded(() => showPage(id))),
    reorder: (ids) => guarded(async () => {
      state.lesson = await store.setPageOrder(state.lesson, ids);
      updatePageBar();
    }),
    remove: removePage,
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
  selection.clear();
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

/* ---------- PC 공유 ----------
   공유를 켜면 수업 방에 지금 쪽을 올리고, 교실 PC의 보기 주소(view.html#방코드)에 나타납니다.
   방 코드와 공유 상태는 태블릿에 저장해, 다음에 앱을 열어도 같은 주소로 이어서 공유합니다. */
const shareBadge = document.createElement('div');
shareBadge.className = 'share-badge';
shareBadge.hidden = true;
document.getElementById('bottomband').prepend(shareBadge);

share.onStatus((st) => {
  shareBadge.hidden = !st.enabled;
  shareBadge.classList.toggle('on', st.enabled && st.connected);
  shareBadge.textContent = st.connected ? 'PC 공유 중' : 'PC 공유: 다시 연결 중';
  drawer.refresh();
});

async function startSharing() {
  toast('PC 공유를 켜는 중입니다…', { duration: 0 });
  const code = await share.enable(await store.getMeta('roomId'));
  if (!code) {
    toast('PC 공유를 켜지 못했습니다. 인터넷 연결을 확인합니다.', { duration: 6000 });
    return false;
  }
  await store.setMeta('roomId', code);
  await store.setMeta('sharing', true);
  if (state.page) share.showPage(state.page, state.strokes, board.view);
  return true;
}

async function toggleSharing() {
  if (share.status().enabled) {
    share.disable();
    await store.setMeta('sharing', false);
    toast('PC 공유를 껐습니다.');
    return;
  }
  if (await startSharing()) {
    toast('PC 공유를 켰습니다. 교실 PC에서 보기 주소를 엽니다.', { duration: 5000 });
  }
}

async function copyViewUrl() {
  const code = share.status().room || (await store.getMeta('roomId'));
  if (!code) { toast('먼저 PC 공유를 켭니다.'); return; }
  const url = share.viewUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    toast('보기 주소를 복사했습니다. 교실 PC 크롬에서 열고 즐겨찾기에 등록합니다.', { duration: 5000 });
  } catch (_) {
    openModal({ title: '보기 주소', message: url, actions: [{ label: '닫기', cancel: true }] });
  }
}

function shareIntro() {
  const st = share.status();
  if (!st.enabled) return st.error ? `꺼져 있습니다. <small>(${escapeHtml(st.error)})</small>` : '꺼져 있습니다.';
  return `${st.connected ? '연결됨' : '다시 연결 중'} · 방 <strong>${st.room}</strong><br><small>${escapeHtml(share.viewUrl())}</small>`;
}

/* ---------- 메뉴 만들기 ---------- */
buildToolbar(document.getElementById('tools'), {
  'tool-pen': togglePen,
  'tool-clear': eraseAll,
  'tool-laser': toggleLaser,
  'tool-width': pickWidth,
  'tool-color': pickColor,
  'tool-select': toggleSelect,
  'tool-undo': undo,
  'tool-redo': redo,
});
buildPagebar(document.getElementById('pagebar'), {
  'page-count': openPages,
  'page-prev': () => goPage(-1),
  'page-next': () => goPage(1),
  'page-add': addPage,
  'page-fullscreen': toggleFullscreen,
});
let lastLayout = null;
const drawer = buildDrawer({
  onOpen: () => drawer.updateInfo(lastLayout, board, input.stats),
  onClose: () => { unlocked = false; },
  sections: [
    { title: '자료', items: [
      { label: 'PDF 열기', onClick: openPdf },
      { label: '이미지 불러오기', onClick: importPictures },
      { label: '카메라 촬영', onClick: takePhoto },
      { label: '배경 바꾸기', onClick: pickBackground },
    ] },
    { title: '공유', intro: shareIntro, items: [
      { label: 'PC 공유', toggle: () => share.status().enabled, onClick: toggleSharing },
      { label: '보기 주소 복사', onClick: copyViewUrl },
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
  getMode: () => ({ eraser: 'erase', laser: 'laser', select: 'select' }[tool.current] || 'draw'),
  getStyle: styleFor,
  onErase: eraseLasso,
  select: selectHooks,
  usePressure: () => prefs.pressure !== false,
  onDown: closePopover,
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
      board.restoreRegion(union(box, board.boardBoxToScreen(strokeBounds(s, board.w, board.h))));
    }
    input.stats.commitMs = performance.now() - t0;
    history.push(state.page.id, { type: 'add', strokes: [s] });
    updateHistoryButtons();
    store.putStroke(toRecord(s)).catch(saveError);
    share.putStrokes(s.pageId, [s]);
    // 수업 목록의 '마지막 수정' 시각은 30초에 한 번만 고칩니다
    if (Date.now() - state.lesson.updatedAt > 30000) {
      state.lesson = { ...state.lesson, updatedAt: Date.now() };
      store.putLesson(state.lesson).catch(saveError);
    }
  },
});

/* ---------- 확대·이동 ---------- */
const zoomBtn = document.createElement('button');
zoomBtn.type = 'button';
zoomBtn.className = 'zoom-reset';
zoomBtn.hidden = true;
zoomBtn.addEventListener('pointerdown', (e) => e.stopPropagation());   // 칠판에 선이 생기지 않게
zoomBtn.addEventListener('click', () => { board.setView({ z: 1, x: 0, y: 0 }); afterViewChange(); });
boardEl.append(zoomBtn);

function updateZoomButton() {
  const z = board.view.z;
  zoomBtn.hidden = z <= 1.001;
  zoomBtn.textContent = `원래 크기 (${Math.round(z * 100)}%)`;
}
function afterViewChange() {
  selection.place();
  updateZoomButton();
}

const viewCtl = attachView({
  host: boardEl,
  board,
  onStart() {
    selection.hide();
    laser.clear();
    closePopover();
  },
  onEnd: afterViewChange,
  onWheelChange: afterViewChange,
  pinchEnabled: () => prefs.pinchZoom !== false,
});

/* 위쪽 띠 오른쪽 '손가락 확대' 체크 상자: 끄면 두 손가락으로 확대·이동하지 않습니다(이 기기에 기억). */
const pinchToggle = document.createElement('label');
pinchToggle.className = 'pinch-toggle';
pinchToggle.title = '두 손가락으로 칠판을 확대·이동합니다';
pinchToggle.innerHTML = '<input type="checkbox"><span>손가락 확대</span>';
const pinchBox = pinchToggle.querySelector('input');
pinchBox.checked = prefs.pinchZoom !== false;
pinchBox.addEventListener('change', () => {
  prefs.pinchZoom = pinchBox.checked;
  savePrefs(prefs);
  toast(pinchBox.checked ? '두 손가락으로 확대·이동할 수 있습니다.' : '두 손가락 확대·이동을 껐습니다.');
});
document.getElementById('topband').append(pinchToggle);

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
    selection.place();
    refreshPictureForSize().catch(() => {});
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
  // 지난번에 공유를 켜 둔 채로 닫았으면 같은 방으로 다시 공유합니다(인터넷이 없으면 조용히 넘어갑니다)
  if (await store.getMeta('sharing')) startSharing().then((ok) => { if (ok) toast('PC 공유를 이어서 켰습니다.'); });
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
