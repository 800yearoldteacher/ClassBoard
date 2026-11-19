/* 확대·이동
   - 두 손가락을 벌리고 오므리면 확대·축소(1~4배), 두 손가락으로 끌면 이동합니다. 펜은 그대로 글씨를 씁니다.
   - 손가락을 움직이는 동안에는 진행 중 층을 CSS로 늘려 보여 주고(빠름), 손을 떼면 새 배율로 선명하게 다시 그립니다.
   - 손바닥처럼 넓게 닿는 접촉과, 펜을 쓴 직후의 접촉은 확대로 보지 않습니다.
   - PC에서는 마우스 휠로 확대·축소합니다(마우스가 가리키는 곳을 중심으로). */

import { BoardCanvas } from './canvas.js';

const PALM_SIZE = 45;     // 접촉 너비·높이가 이보다 크면(px) 손바닥으로 봅니다
const PEN_QUIET_MS = 300; // 펜을 쓴 뒤 이 시간 안의 두 손가락 접촉은 무시합니다

/* pinchEnabled: 위쪽 띠 오른쪽 '손가락 확대' 체크 상자. 끄면 두 손가락 확대·이동을 받지 않습니다(휠은 그대로). */
export function attachView({ host, board, onStart, onEnd, onWheelChange, pinchEnabled = () => true }) {
  const touches = new Map();   // pointerId → { x, y }
  let g = null;                // 진행 중인 손짓 { v0, m0, d0, view }
  let lastPen = 0;

  const isPalm = (e) => (e.width || 0) > PALM_SIZE || (e.height || 0) > PALM_SIZE;

  function pair() {
    const [a, b] = [...touches.values()];
    return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  /* 화면(칠판 영역 안) 점 m을 손짓 시작 때 가리키던 칠판 위치에 계속 붙여 둡니다. */
  function viewFor(m, z) {
    const r = host.getBoundingClientRect();
    const { v0, m0 } = g;
    const u = v0.x + (m0.x - r.left) / r.width / v0.z;
    const v = v0.y + (m0.y - r.top) / r.height / v0.z;
    return BoardCanvas.clampView({ z, x: u - (m.x - r.left) / r.width / z, y: v - (m.y - r.top) / r.height / z });
  }

  function preview(view) {
    // 시작 때 그림을 새 상태에 맞게 늘리고 옮겨 보여 줍니다
    const { v0 } = g;
    const k = view.z / v0.z;
    const tx = (v0.x - view.x) * view.z * board.w;
    const ty = (v0.y - view.y) * view.z * board.h;
    board.live.style.transformOrigin = '0 0';
    board.live.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  function start() {
    const { m, d } = pair();
    g = { v0: { ...board.view }, m0: m, d0: d, view: { ...board.view } };
    onStart();
  }

  function finish() {
    const view = g.view;
    g = null;
    board.live.style.transform = '';
    board.setView(view);
    onEnd();
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') { lastPen = performance.now(); return; }
    if (e.pointerType !== 'touch' || isPalm(e) || !pinchEnabled()) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && !g && performance.now() - lastPen > PEN_QUIET_MS) start();
  }, true);   // 그리기보다 먼저 받아, 두 번째 손가락이면 그리기를 막습니다

  host.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'pen') { lastPen = performance.now(); return; }
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g || touches.size < 2) return;
    const { m, d } = pair();
    g.view = viewFor(m, g.v0.z * (d / g.d0));
    preview(g.view);
  }, true);

  const lift = (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (g && touches.size < 2) finish();
  };
  host.addEventListener('pointerup', lift, true);
  host.addEventListener('pointercancel', lift, true);

  /* PC: 마우스 휠로 확대·축소 */
  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    const v0 = board.view;
    const z = Math.min(4, Math.max(1, v0.z * Math.exp(-e.deltaY * 0.0015)));
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const u = v0.x + fx / v0.z, v = v0.y + fy / v0.z;
    board.setView({ z, x: u - fx / z, y: v - fy / z });
    onWheelChange();
  }, { passive: false });

  return {
    get active() { return !!g; },
  };
}
