/* 쪽 관리 창
   - 쪽마다 작은 미리보기를 격자로 보여 줍니다. 지금 쪽은 테두리로 표시합니다.
   - 미리보기를 누르면 그 쪽으로 갑니다.
   - 미리보기를 끌어 다른 자리에 놓으면 순서가 바뀝니다(끄는 동안 자리를 미리 보여 줍니다).
   - 미리보기 오른쪽 위의 지우기 버튼으로 쪽을 지웁니다(한 번 더 확인은 main.js가 합니다). */

import { icon } from './icons.js';

const DRAG_START = 10;   // 이만큼(px) 움직이면 누르기가 아니라 끌기로 봅니다

export function openPageManager({ getIds, getCurrentId, drawThumb, go, reorder, remove }) {
  const back = document.createElement('div');
  back.className = 'pm-back';
  const panel = document.createElement('div');
  panel.className = 'pm';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML = `
    <div class="pm-head">
      <h2></h2>
      <button type="button" class="tool small" aria-label="닫기" title="닫기">${icon('close')}</button>
    </div>
    <p class="pm-hint">미리보기를 누르면 그 쪽으로 갑니다. 끌어서 놓으면 쪽 순서가 바뀝니다.</p>
    <div class="pm-grid"></div>`;
  back.append(panel);
  document.body.append(back);

  const title = panel.querySelector('h2');
  const grid = panel.querySelector('.pm-grid');
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey, true);
  panel.querySelector('.pm-head button').addEventListener('click', close);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });

  function renumber() {
    [...grid.children].forEach((cell, i) => { cell.querySelector('.pm-num').textContent = String(i + 1); });
  }

  async function render() {
    const ids = getIds();
    const current = getCurrentId();
    title.textContent = `쪽 관리 (전체 ${ids.length}쪽)`;
    grid.replaceChildren();
    for (const id of ids) {
      const cell = document.createElement('div');
      cell.className = 'pm-cell' + (id === current ? ' current' : '');
      cell.dataset.id = id;
      const cv = document.createElement('canvas');
      cv.className = 'pm-thumb';
      const num = document.createElement('span');
      num.className = 'pm-num';
      cell.append(cv, num);
      if (ids.length > 1) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'pm-del';
        del.title = '이 쪽 지우기';
        del.setAttribute('aria-label', '이 쪽 지우기');
        del.innerHTML = icon('close');
        del.addEventListener('pointerdown', (e) => e.stopPropagation());
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          const n = [...grid.children].indexOf(cell) + 1;
          if (await remove(id, n)) render();
        });
        cell.append(del);
      }
      grid.append(cell);
    }
    renumber();
    const cur = grid.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    // 미리보기는 하나씩 차례로 그립니다(쪽이 많아도 창이 먼저 뜹니다)
    for (const cell of [...grid.children]) {
      if (closed) return;
      try { await drawThumb(cell.dataset.id, cell.querySelector('canvas')); } catch (e) { console.error(e); }
    }
  }

  /* ---------- 누르기와 끌기 ---------- */
  let press = null;   // { pid, cell, x0, y0, dragging, ghost, dx, dy }

  grid.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.pm-cell');
    if (!cell || press) return;
    press = { pid: e.pointerId, cell, x0: e.clientX, y0: e.clientY, dragging: false, ghost: null };
    try { grid.setPointerCapture(e.pointerId); } catch (_) { /* 무시합니다 */ }
    e.preventDefault();
  });

  function startDrag(e) {
    const { cell } = press;
    const r = cell.getBoundingClientRect();
    const ghost = document.createElement('canvas');
    ghost.className = 'pm-ghost';
    const src = cell.querySelector('canvas');
    ghost.width = src.width; ghost.height = src.height;
    ghost.getContext('2d').drawImage(src, 0, 0);
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${src.getBoundingClientRect().height}px`;
    document.body.append(ghost);
    press.ghost = ghost;
    press.dx = e.clientX - r.left;
    press.dy = e.clientY - r.top;
    press.dragging = true;
    cell.classList.add('placeholder');
  }

  grid.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.pid) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_START) return;
      startDrag(e);
    }
    press.ghost.style.transform = `translate(${e.clientX - press.dx}px, ${e.clientY - press.dy}px)`;
    // 손가락이 가리키는 미리보기 자리로 옮겨 놓습니다
    const over = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList && el.classList.contains('pm-cell'));
    if (over && over !== press.cell) {
      const cells = [...grid.children];
      const from = cells.indexOf(press.cell);
      const to = cells.indexOf(over);
      grid.insertBefore(press.cell, from < to ? over.nextSibling : over);
      renumber();
    }
    // 창 위아래 끝에 닿으면 저절로 넘깁니다
    const g = grid.getBoundingClientRect();
    if (e.clientY < g.top + 40) grid.scrollTop -= 12;
    else if (e.clientY > g.bottom - 40) grid.scrollTop += 12;
  });

  async function finish(e, cancelled) {
    if (!press || e.pointerId !== press.pid) return;
    const p = press;
    press = null;
    if (!p.dragging) {
      if (!cancelled) { close(); await go(p.cell.dataset.id); }
      return;
    }
    p.ghost.remove();
    p.cell.classList.remove('placeholder');
    const before = getIds();
    const after = [...grid.children].map((c) => c.dataset.id);
    if (cancelled) { render(); return; }
    if (after.join() !== before.join()) {
      await reorder(after);
      title.textContent = `쪽 관리 (전체 ${after.length}쪽)`;
    }
  }
  grid.addEventListener('pointerup', (e) => finish(e, false));
  grid.addEventListener('pointercancel', (e) => finish(e, true));

  render();
  return close;
}
