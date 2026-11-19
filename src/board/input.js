/* 펜 입력
   - 펜이 한 번이라도 감지되면 손가락으로는 그리지 않습니다(설정에서 켤 수 있음).
   - 손바닥이 펜보다 먼저 닿아 시작된 손가락 선은 펜이 닿는 순간 버립니다.
   - 펜의 필압 0인 점은 버립니다. 펜을 떼는 순간 들어오는 이 점들이 선 끝을 늘입니다(0-A).
   - 예측 그리기는 쓰지 않습니다(기본값 끔).
   - 그리는 동안에는 새 조각만 덧그리고(빠름), 펜을 떼면 main.js가 완성 모양으로 바꿉니다.
   모드
   - draw : 펜 선
   - erase: 빨간 점선 고리. 펜을 떼면 main.js가 고리 안의 선을 지웁니다.
   - laser: 레이저 잔상(진행 중 층에는 그리지 않습니다)
   - select: 선택 상자 안을 누르면 옮기기(move), 밖을 누르면 파란 점선 고리로 묶기(pick) */

import { previewWidth, previewColor } from './ink.js';
import { baseColor } from './backgrounds.js';

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const LASSO_COLOR = { erase: '#ff6b6b', pick: '#5aa9ff' };

export function attachInput({ host, board, laser, getMode, getStyle, onCommit, onErase, onDown, canFingerDraw, select }) {
  let penSeen = false;
  let active = null;
  let rect = null;

  /* 처리 시간 기록(화면 정보에 표시). 펜이 움직일 때 한 번 처리하는 데 걸린 시간입니다. */
  const stats = { count: 0, total: 0, max: 0, lastAvg: 0, lastMax: 0, lastEvents: 0, commitMs: 0 };

  function toPt(ev) {
    const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    let p = 0.5;
    if (ev.pointerType === 'pen') p = ev.pressure > 0 ? ev.pressure : 0.2;
    return [r5(x), r5(y), Math.round(p * 1000) / 1000];
  }

  function growBox(a, prev, q, lw) {
    const W = board.w, H = board.h;
    const pad = lw / 2 + 3;
    const x0 = Math.min(prev[0], q[0]) * W - pad, y0 = Math.min(prev[1], q[1]) * H - pad;
    const x1 = Math.max(prev[0], q[0]) * W + pad, y1 = Math.max(prev[1], q[1]) * H + pad;
    if (!a.box) { a.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; return; }
    const bx = Math.min(a.box.x, x0), by = Math.min(a.box.y, y0);
    a.box = { x: bx, y: by, w: Math.max(a.box.x + a.box.w, x1) - bx, h: Math.max(a.box.y + a.box.h, y1) - by };
  }

  /* 새 점까지 짧은 조각 하나를 그립니다. */
  function drawTo(q) {
    const a = active;
    const W = board.w, H = board.h;
    const prev = a.pts.length ? a.pts[a.pts.length - 1] : q;
    const ctx = board.liveCtx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let lw;
    const lasso = a.mode === 'erase' || a.mode === 'pick';
    if (lasso) {
      lw = 2.5;
      ctx.strokeStyle = LASSO_COLOR[a.mode];
      ctx.lineWidth = lw;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -a.len;   // 조각이 이어져도 점선 간격이 끊기지 않게 합니다
    } else {
      lw = previewWidth(a.st, (prev[2] + q[2]) / 2, W);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = lw;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(prev[0] * W, prev[1] * H);
    ctx.lineTo(q[0] * W, q[1] * H);
    ctx.stroke();
    if (lasso) {
      ctx.setLineDash([]);
      a.len += Math.hypot((q[0] - prev[0]) * W, (q[1] - prev[1]) * H);
    }
    growBox(a, prev, q, lw);
    a.pts.push(q);
  }

  function addPoint(ev) {
    if (ev.pointerType === 'pen' && ev.pressure === 0) { active.zeros.push(toPt(ev)); return; }
    const q = toPt(ev);
    if (active.mode === 'laser') { laser.add(q); active.pts.push(q); return; }
    if (active.mode === 'move') { active.last = q; return; }
    drawTo(q);
  }

  function cancel() {
    if (!active) return;
    if (active.mode === 'laser') laser.end();
    else if (active.mode === 'move') select.end(true);
    else board.restoreRegion(active.box);
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
    const mode = getMode();
    const st = getStyle(e.pointerType);
    active = {
      pid: e.pointerId, type: e.pointerType, mode, st,
      color: previewColor(st, baseColor(board.background)),
      pts: [], zeros: [], box: null, len: 0,
    };
    stats.count = 0; stats.total = 0; stats.max = 0;
    if (mode === 'laser') {
      const q = toPt(e);
      active.pts.push(q);
      laser.begin(q);
    } else if (mode === 'select') {
      const q = toPt(e);
      if (select.down(q) === 'move') {
        active.mode = 'move';
        active.start = q;
        active.last = q;
      } else {
        active.mode = 'pick';
        drawTo(q);
      }
    } else {
      addPoint(e);
    }
    try { host.setPointerCapture(e.pointerId); } catch (_) { /* 가짜 입력으로 시험할 때 */ }
    e.preventDefault();
  });

  host.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.pid) return;
    const t0 = performance.now();
    let list = [];
    if (typeof e.getCoalescedEvents === 'function') {
      try { list = e.getCoalescedEvents(); } catch (_) { list = []; }
    }
    if (active.mode === 'move') {
      // 옮길 때는 마지막 위치만 쓰면 됩니다
      addPoint(e);
      select.move(active.last[0] - active.start[0], active.last[1] - active.start[1]);
    } else {
      for (const ev of (list.length ? list : [e])) addPoint(ev);
    }
    const dt = performance.now() - t0;
    stats.count += 1; stats.total += dt; if (dt > stats.max) stats.max = dt;
  });

  function finish(e, cancelled) {
    if (!active || e.pointerId !== active.pid) return;
    if (cancelled) { cancel(); return; }
    const a = active;
    active = null;
    if (stats.count) {
      stats.lastAvg = stats.total / stats.count;
      stats.lastMax = stats.max;
      stats.lastEvents = stats.count;
    }
    if (a.mode === 'laser') { laser.end(); return; }
    if (a.mode === 'erase') { onErase(a.pts, a.box); return; }
    if (a.mode === 'move') { select.end(false); return; }
    if (a.mode === 'pick') { select.pick(a.pts, a.box); return; }
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
    stats,
  };
}
