/* 펜 입력
   - 손가락(터치)으로는 그리지 않습니다. 펜(태블릿)과 마우스(교실 PC·전자칠판)로만 씁니다(사용자 결정).
     손가락은 두 손가락 확대·이동에만 씁니다(board/view.js).
   - 펜의 필압 0인 점은 버립니다. 펜을 떼는 순간 들어오는 이 점들이 선 끝을 늘입니다(0-A).
   - 필압은 앞 점과 섞어 고르고(이동 평균), 아주 약한 필압도 PRESSURE_MIN 아래로는 내리지 않습니다.
     필압 값이 점마다 오르내리면 선이 구슬 꿴 것처럼 굵었다 가늘었다 해 끊겨 보였습니다(0.15.0).
   - 예측 그리기는 쓰지 않습니다(기본값 끔).
   - 그리는 동안에는 새 조각만 덧그리고(빠름), 펜을 떼면 main.js가 완성 모양으로 바꿉니다.
   모드
   - draw : 펜 선
   - erase: 빨간 점선 고리. 펜을 떼면 main.js가 고리 안의 선을 지웁니다.
   - laser: 레이저 잔상(진행 중 층에는 그리지 않습니다)
   - select: 선택 상자 안을 누르면 옮기기(move), 밖을 누르면 파란 점선 고리로 묶기(pick)
   펜 버튼·지우개 끝(0.16.0)
   - S펜 버튼을 누른 채 대거나 지우개 끝으로 대면, 지금 도구와 상관없이 그 획만 고리 지우개(erase)가 됩니다.
     펜을 대는 순간의 버튼 상태로 정하고, 긋는 중간에 버튼을 눌러도 바꾸지 않습니다.
   - 웹 표준(Pointer Events)에서 펜 옆 버튼은 button 2·buttons 2, 지우개 끝은 button 5·buttons 32입니다.
   - 갤럭시탭 S11의 S펜 버튼은 위 펜 신호가 아니라 '종류 모름' 메뉴 열기 신호(contextmenu)로 들어옵니다(0.16.0 태블릿 시험).
     이 신호는 누른 순간 한 번만 오므로(0.17.0)
       · 펜을 댄 채 받으면 긋던 획을 그 자리에서 고리 지우개로 바꾸고(그은 부분이 고리의 시작이 됩니다),
       · 펜을 띄운 채 받으면 3초 안에 긋는 다음 한 획만 고리 지우개로 씁니다.
     PC 마우스 오른쪽 클릭('mouse')과 손가락 길게 누르기('touch')는 버튼으로 보지 않습니다.
   - 0.17.0 태블릿 시험에서 버튼 신호가 펜을 댄 채 눌러도 '펜 뗌'으로 찍히고 지워지지 않았습니다.
     원인을 찾으려고 0.17.1부터 펜·마우스·손가락의 대기·떼기·취소와 메뉴 열기 신호를 순서대로
     최근 12개까지 stats.penLog에 남겨 화면 정보 '펜 버튼 신호'에 보여 줍니다. */

import { previewWidth, previewColor } from './ink.js';
import { baseColor } from './backgrounds.js';

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const PRESSURE_SMOOTH = 0.35;   // 새 필압을 얼마나 반영할지(작을수록 고르게, 대신 굵기 변화가 늦게 따라옵니다)
const PRESSURE_MIN = 0.15;      // 이보다 약하게 눌러도 이 필압으로 그립니다
const LASSO_COLOR = { erase: '#ff6b6b', pick: '#5aa9ff' };

const NO_RELAY = { begin() {}, point() {}, end() {} };
const ARM_MS = 3000;   // 펜을 띄운 채 버튼을 누른 뒤 이 시간 안에 그어야 지우개가 됩니다
const LOG_MAX = 12;

/* 펜 옆 버튼을 누르고 있거나 지우개 끝인지 */
const isPenButton = (e) => e.pointerType === 'pen' && ((e.buttons & 2) !== 0 || e.button === 2);
const isEraserTip = (e) => e.pointerType === 'pen' && ((e.buttons & 32) !== 0 || e.button === 5);

/* relay: 긋고 있는 선·레이저를 교실 PC로 실시간 보내는 곳(share.js). 공유를 끄면 아무것도 하지 않습니다. */
export function attachInput({ host, board, laser, getMode, getStyle, onCommit, onErase, onDown, select, usePressure = () => true, relay = NO_RELAY }) {
  let active = null;
  let rect = null;

  /* 처리 시간 기록(화면 정보에 표시). 펜이 움직일 때 한 번 처리하는 데 걸린 시간입니다. */
  const stats = { count: 0, total: 0, max: 0, lastAvg: 0, lastMax: 0, lastEvents: 0, commitMs: 0, penLog: [] };
  let armedUntil = 0;   // 펜을 띄운 채 버튼을 눌렀을 때, 다음 획을 지우개로 쓸 수 있는 마감 시각

  /* 펜 버튼 신호 기록(최근 것이 위). 보통 펜 끝(button -1·0, buttons 0·1)은 남기지 않습니다. */
  function log(text) {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const t = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p2(Math.floor(d.getMilliseconds() / 10))}`;
    const pen = active ? `펜 댐(${active.mode})` : '펜 뗌';
    stats.penLog.unshift(`${t} ${text} · ${pen}`);
    stats.penLog.length = Math.min(stats.penLog.length, LOG_MAX);
  }
  const KIND = { pen: '펜', mouse: '마우스', touch: '손가락' };
  const EVT = { pointerdown: '대기', pointerup: '떼기', pointercancel: '취소', pointermove: '움직임' };
  function noteSignal(e) {
    // 움직임은 너무 많아 보통 펜 끝·손가락은 남기지 않고, 다른 버튼 값이 있을 때만 남깁니다
    if (e.type === 'pointermove' && ((e.buttons & ~1) === 0 || e.pointerType === 'touch')) return;
    const what = isEraserTip(e) ? ' 지우개 끝' : isPenButton(e) ? ' 옆 버튼' : '';
    log(`${KIND[e.pointerType] || e.pointerType || '종류 모름'} ${EVT[e.type]}${what} (button ${e.button}, buttons ${e.buttons})`);
  }
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) host.addEventListener(t, noteSignal, true);

  /* S펜 버튼: '종류 모름' 메뉴 열기 신호로 들어옵니다. */
  document.addEventListener('contextmenu', (e) => {
    log(`메뉴 열기 신호 (종류 ${e.pointerType || '모름'})`);
    if (e.pointerType) return;   // 마우스 오른쪽 클릭·손가락 길게 누르기는 버튼이 아닙니다
    if (active) {
      if (active.type === 'pen') toErase();
    } else {
      armedUntil = performance.now() + ARM_MS;
    }
  });
  // 버튼이 다른 모양으로 들어오는 경우도 기록만 해 둡니다
  document.addEventListener('auxclick', (e) => log(`보조 클릭 (종류 ${e.pointerType || '모름'}, button ${e.button})`));
  document.addEventListener('keydown', (e) => log(`키 신호 (${e.key})`));

  /* 긋던 획을 그 자리에서 고리 지우개로 바꿉니다. 지금까지 지나온 점이 고리의 시작이 됩니다. */
  function toErase() {
    const a = active;
    if (a.mode === 'erase' || a.mode === 'move') return;
    if (a.mode === 'laser') laser.end();
    else board.restoreRegion(a.box);   // 그리던 선·파란 고리 자국을 지웁니다
    if (a.mode === 'draw' || a.mode === 'laser') relay.end();   // 교실 PC의 실시간 선·레이저도 지웁니다
    const old = a.pts;
    a.mode = 'erase';
    a.temp = true;
    a.pts = [];
    a.box = null;
    a.len = 0;
    for (const q of old) drawTo(q);
  }

  /* 화면 위치 → 칠판 기준 비율 좌표(확대 상태를 거꾸로 풀어 줍니다) */
  function toPt(ev) {
    const { z, x: vx, y: vy } = board.view;
    const fx = (ev.clientX - rect.left) / rect.width;
    const fy = (ev.clientY - rect.top) / rect.height;
    const x = Math.min(1, Math.max(0, vx + fx / z));
    const y = Math.min(1, Math.max(0, vy + fy / z));
    // 필압 반영을 끄면 펜도 늘 0.5로 기록해, 누르는 힘과 상관없이 같은 굵기가 됩니다
    let p = 0.5;
    if (ev.pointerType === 'pen' && usePressure() && active) {
      const raw = Math.max(PRESSURE_MIN, ev.pressure > 0 ? ev.pressure : 0.2);
      p = active.p == null ? raw : active.p + (raw - active.p) * PRESSURE_SMOOTH;
      if (ev.pressure > 0) active.p = p;   // 버리는 필압 0 점은 평균에 넣지 않습니다
    }
    return [r5(x), r5(y), Math.round(p * 1000) / 1000];
  }

  /* 바뀐 구역(화면 좌표)을 넓힙니다. */
  function growBox(a, p0, p1, lw) {
    const pad = lw / 2 + 3;
    const x0 = Math.min(p0[0], p1[0]) - pad, y0 = Math.min(p0[1], p1[1]) - pad;
    const x1 = Math.max(p0[0], p1[0]) + pad, y1 = Math.max(p0[1], p1[1]) + pad;
    if (!a.box) { a.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; return; }
    const bx = Math.min(a.box.x, x0), by = Math.min(a.box.y, y0);
    a.box = { x: bx, y: by, w: Math.max(a.box.x + a.box.w, x1) - bx, h: Math.max(a.box.y + a.box.h, y1) - by };
  }

  /* 새 점까지 짧은 조각 하나를 그립니다(화면 좌표, 확대하면 굵기도 함께 커집니다). */
  function drawTo(q) {
    const a = active;
    const W = board.w;
    const z = board.view.z;
    const prev = a.pts.length ? a.pts[a.pts.length - 1] : q;
    const s0 = board.toScreen(prev[0], prev[1]);
    const s1 = board.toScreen(q[0], q[1]);
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
      lw = previewWidth(a.st, (prev[2] + q[2]) / 2, W) * z;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = lw;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(s0[0], s0[1]);
    ctx.lineTo(s1[0], s1[1]);
    ctx.stroke();
    if (lasso) {
      ctx.setLineDash([]);
      a.len += Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
    }
    growBox(a, s0, s1, lw);
    a.pts.push(q);
  }

  function addPoint(ev) {
    if (ev.pointerType === 'pen' && ev.pressure === 0) { active.zeros.push(toPt(ev)); return; }
    const q = toPt(ev);
    if (active.mode === 'laser') { laser.add(q); active.pts.push(q); relay.point(q); return; }
    if (active.mode === 'move') { active.last = q; return; }
    drawTo(q);
    if (active.mode === 'draw') relay.point(q);   // 교실 PC로 실시간 전달(공유 중일 때)
  }

  function cancel() {
    if (!active) return;
    if (active.mode === 'laser') laser.end();
    else if (active.mode === 'move') select.end(true);
    else board.restoreRegion(active.box);
    relay.end();
    active = null;
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    onDown();
    if (e.pointerType === 'touch') return;   // 손가락·손바닥으로는 그리지 않습니다
    if (active) return;
    rect = host.getBoundingClientRect();
    const armed = e.pointerType === 'pen' && performance.now() < armedUntil;
    armedUntil = 0;
    const temp = isPenButton(e) || isEraserTip(e) || armed;   // 이 획만 고리 지우개
    const mode = temp ? 'erase' : getMode();
    const st = getStyle(e.pointerType);
    active = {
      pid: e.pointerId, type: e.pointerType, mode, st, temp,
      color: previewColor(st, baseColor(board.background)),
      pts: [], zeros: [], box: null, len: 0, p: null,
    };
    stats.count = 0; stats.total = 0; stats.max = 0;
    if (mode === 'laser') {
      const q = toPt(e);
      active.pts.push(q);
      laser.begin(q);
      relay.begin('laser');
      relay.point(q);
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
      if (mode === 'draw') relay.begin('draw', st);
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
    if (a.mode === 'laser') { laser.end(); relay.end(); return; }
    if (a.mode === 'erase') { onErase(a.pts, a.box, a.temp); return; }
    if (a.mode === 'move') { select.end(false); return; }
    if (a.mode === 'pick') { select.pick(a.pts, a.box); return; }
    // 필압을 0으로만 보내는 펜이면 버린 점을 되살려 선이 사라지지 않게 합니다
    if (a.type === 'pen' && a.pts.length <= 2 && a.zeros.length > 3) a.pts = a.pts.concat(a.zeros.map((q) => [q[0], q[1], 0.5]));
    if (!a.pts.length) { board.restoreRegion(a.box); relay.end(); return; }
    // 한 번 톡 찍은 점도 보이도록 아주 짧은 선으로 만듭니다
    const pts = a.pts.length === 1 ? [a.pts[0], [a.pts[0][0] + 0.0004, a.pts[0][1] + 0.0004, a.pts[0][2]]] : a.pts;
    onCommit({ ...a.st, pts }, a.box);
    relay.end();   // 완성된 선을 올린 뒤에 실시간 선을 지웁니다
  }
  host.addEventListener('pointerup', (e) => finish(e, false));
  host.addEventListener('pointercancel', (e) => finish(e, true));

  return {
    get drawing() { return !!active; },
    stats,
  };
}
