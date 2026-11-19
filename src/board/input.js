/* 펜 입력
   - 펜이 한 번이라도 감지되면 손가락으로는 그리지 않습니다(설정에서 켤 수 있음).
   - 손바닥이 펜보다 먼저 닿아 시작된 손가락 선은 펜이 닿는 순간 버립니다.
   - 펜의 필압 0인 점은 버립니다. 펜을 떼는 순간 들어오는 이 점들이 선 끝을 늘입니다(0-A).
   - 예측 그리기는 쓰지 않습니다(기본값 끔). */

import { outline, toPath, bounds, union } from './ink.js';

const r5 = (n) => Math.round(n * 1e5) / 1e5;

export function attachInput({ host, board, getStyle, onCommit, onDown, canFingerDraw }) {
  let penSeen = false;
  let active = null;
  let rect = null;
  let raf = 0;

  function toPt(ev) {
    const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    let p = 0.5;
    if (ev.pointerType === 'pen') p = ev.pressure > 0 ? ev.pressure : 0.2;
    return [r5(x), r5(y), Math.round(p * 1000) / 1000];
  }

  function addPoint(ev) {
    if (ev.pointerType === 'pen' && ev.pressure === 0) { active.zeros.push(toPt(ev)); return; }
    active.pts.push(toPt(ev));
  }

  /* 그리는 중인 선을 진행 중 층에 그립니다. 바뀐 구역만 배경·판서층으로 되돌린 뒤 덧그립니다. */
  function render() {
    raf = 0;
    if (!active || !active.pts.length) return;
    const o = outline(active.pts, active.st, board.w, board.h, false);
    const box = bounds(o);
    board.restoreRegion(union(active.box, box));
    board.liveCtx.fillStyle = active.st.color;
    board.liveCtx.fill(toPath(o));
    active.box = box;
  }
  function schedule() {
    if (board.lowLatency) render();
    else if (!raf) raf = requestAnimationFrame(render);
  }

  function cancel() {
    if (!active) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    board.restoreRegion(active.box);
    active = null;
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onDown();
    if (e.pointerType === 'pen') {
      penSeen = true;
      if (active && active.type === 'touch') cancel();
    }
    if (e.pointerType === 'touch' && penSeen && !canFingerDraw()) return;
    if (active) return;
    rect = host.getBoundingClientRect();
    active = { pid: e.pointerId, type: e.pointerType, st: getStyle(e.pointerType), pts: [], zeros: [], box: null };
    addPoint(e);
    try { host.setPointerCapture(e.pointerId); } catch (_) { /* 가짜 입력으로 시험할 때 */ }
    e.preventDefault();
    schedule();
  });

  host.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.pid) return;
    let list = [];
    if (typeof e.getCoalescedEvents === 'function') {
      try { list = e.getCoalescedEvents(); } catch (_) { list = []; }
    }
    for (const ev of (list.length ? list : [e])) addPoint(ev);
    schedule();
  });

  function finish(e, cancelled) {
    if (!active || e.pointerId !== active.pid) return;
    if (cancelled) { cancel(); return; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const a = active;
    active = null;
    // 필압을 0으로만 보내는 펜이면 버린 점을 되살려 선이 사라지지 않게 합니다
    if (a.type === 'pen' && a.pts.length <= 2 && a.zeros.length > 3) a.pts = a.pts.concat(a.zeros.map((q) => [q[0], q[1], 0.5]));
    if (!a.pts.length) { board.restoreRegion(a.box); return; }
    // 한 번 톡 찍은 점도 보이도록 아주 짧은 선으로 만듭니다
    const pts = a.pts.length === 1 ? [a.pts[0], [a.pts[0][0] + 0.0004, a.pts[0][1] + 0.0004, a.pts[0][2]]] : a.pts;
    onCommit({ ...a.st, pts }, a.box);
  }
  host.addEventListener('pointerup', (e) => finish(e, false));
  host.addEventListener('pointercancel', (e) => finish(e, true));

  return {
    get drawing() { return !!active; },
  };
}
