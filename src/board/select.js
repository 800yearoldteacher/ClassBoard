/* 선택: 고리로 묶은 선을 옮기거나 지웁니다.
   - 묶인 선 둘레에 파란 점선 상자와 '지우기' 버튼을 보입니다(화면 요소라 칠판 크기가 바뀌어도 비율로 따라갑니다).
   - 옮기는 동안에는 묶인 선을 판서층에서 잠시 빼고, 그 선만 그린 작은 투명 캔버스를 손가락·펜을 따라 움직입니다.
     매번 다시 그리지 않으므로 선이 많아도 가볍습니다. 손을 떼면 좌표를 고쳐 판서층에 다시 그립니다. */

import { paintStroke } from './ink.js';

const HL_SCALE = 3;

function rawBounds(strokes) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const s of strokes) {
    for (const p of s.pts) {
      if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1];
    }
  }
  return { x0, y0, x1, y1 };
}

export class Selection {
  constructor(host, board, { onDelete }) {
    this.host = host;
    this.board = board;
    this.strokes = [];
    this.raw = null;   // 선 점들의 범위(비율)
    this.box = null;   // 선 굵기만큼 넓힌 상자(비율)
    this.dx = 0; this.dy = 0;
    this.overlay = null;

    this.boxEl = document.createElement('div');
    this.boxEl.className = 'sel-box';
    this.boxEl.hidden = true;
    this.delBtn = document.createElement('button');
    this.delBtn.type = 'button';
    this.delBtn.className = 'sel-delete';
    this.delBtn.textContent = '지우기';
    this.delBtn.hidden = true;
    // 버튼을 누를 때 칠판의 펜 입력이 시작되지 않게 합니다
    this.delBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.delBtn.addEventListener('click', () => onDelete(this.strokes.slice()));
    host.append(this.boxEl, this.delBtn);
  }

  get active() { return this.strokes.length > 0; }

  set(strokes) {
    this.strokes = strokes;
    if (!strokes.length) { this.clear(); return; }
    this.raw = rawBounds(strokes);
    const W = this.board.w || 1, H = this.board.h || 1;
    const maxW = Math.max(...strokes.map((s) => s.w * (s.tool === 'hl' ? HL_SCALE : 1)));
    const px = maxW * 0.9 + 6 / W;            // 선 굵기 절반과 여유
    const py = (maxW * 0.9) * (W / H) + 6 / H;
    this.box = { x0: this.raw.x0 - px, y0: this.raw.y0 - py, x1: this.raw.x1 + px, y1: this.raw.y1 + py };
    this.dx = 0; this.dy = 0;
    this.place();
  }

  clear() {
    this.strokes = [];
    this.raw = null;
    this.box = null;
    this.boxEl.hidden = true;
    this.delBtn.hidden = true;
    this.dropOverlay();
  }

  /* 상자와 버튼을 비율(%)로 놓아, 칠판 크기가 바뀌어도 제자리를 지킵니다. */
  place() {
    const b = this.box;
    const s = this.boxEl.style;
    s.left = `${b.x0 * 100}%`;
    s.top = `${b.y0 * 100}%`;
    s.width = `${(b.x1 - b.x0) * 100}%`;
    s.height = `${(b.y1 - b.y0) * 100}%`;
    s.transform = '';
    this.boxEl.hidden = false;
    const d = this.delBtn.style;
    d.left = `${Math.min(b.x1, 0.97) * 100}%`;
    // 위쪽 끝이면 상자 아래에, 아니면 상자 위에 둡니다
    if (b.y0 < 0.08) { d.top = `${Math.min(b.y1, 0.95) * 100}%`; d.transform = 'translate(-100%, 6px)'; }
    else { d.top = `${b.y0 * 100}%`; d.transform = 'translate(-100%, calc(-100% - 6px))'; }
    this.delBtn.hidden = false;
  }

  contains(q, margin = 0.01) {
    const b = this.box;
    return !!b && q[0] >= b.x0 - margin && q[0] <= b.x1 + margin && q[1] >= b.y0 - margin && q[1] <= b.y1 + margin;
  }

  /* 옮기기 시작: 묶인 선만 그린 투명 캔버스를 상자 자리에 얹습니다. */
  beginMove() {
    const { w: W, h: H, dpr } = this.board;
    const b = this.box;
    const c = document.createElement('canvas');
    c.className = 'sel-overlay';
    c.width = Math.max(1, Math.round((b.x1 - b.x0) * W * dpr));
    c.height = Math.max(1, Math.round((b.y1 - b.y0) * H * dpr));
    c.style.left = `${b.x0 * 100}%`;
    c.style.top = `${b.y0 * 100}%`;
    c.style.width = `${(b.x1 - b.x0) * 100}%`;
    c.style.height = `${(b.y1 - b.y0) * 100}%`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, -b.x0 * W * dpr, -b.y0 * H * dpr);
    for (const s of this.strokes) if (s.tool === 'hl') paintStroke(ctx, s, W, H);
    for (const s of this.strokes) if (s.tool !== 'hl') paintStroke(ctx, s, W, H);
    this.host.append(c);
    this.overlay = c;
    this.delBtn.hidden = true;
    this.dx = 0; this.dy = 0;
  }

  /* 시작점에서 (dx, dy)만큼 옮깁니다. 선이 칠판 밖으로 나가지 않게 막습니다. */
  moveTo(dx, dy) {
    const r = this.raw;
    this.dx = Math.min(1 - r.x1, Math.max(-r.x0, dx));
    this.dy = Math.min(1 - r.y1, Math.max(-r.y0, dy));
    const t = `translate(${this.dx * this.board.w}px, ${this.dy * this.board.h}px)`;
    if (this.overlay) this.overlay.style.transform = t;
    this.boxEl.style.transform = t;
  }

  endMove() {
    const moved = { dx: this.dx, dy: this.dy };
    this.dropOverlay();
    return moved;
  }

  dropOverlay() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
  }
}
