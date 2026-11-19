/* 레이저 포인터
   펜이 지나간 길을 빨간 빛줄기로 보여 주고, 각 부분은 약 1.5초 뒤 서서히 사라집니다.
   저장하지 않고 되돌리기 대상도 아닙니다.
   매 화면마다 빛줄기를 다시 그려야 하므로, 불투명한 진행 중 층 위에 따로 얹은 투명한 일반 캔버스에 그립니다.
   (검게 덮이는 문제는 투명한 '저지연' 캔버스에서만 생겼습니다.) */

export const LASER_MS = 1500;

export class Laser {
  constructor(host) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'laser-layer';
    this.ctx = this.canvas.getContext('2d');
    host.append(this.canvas);
    this.w = 0; this.h = 0; this.dpr = 1;
    this.trail = [];       // { x, y, t } 칠판 기준 비율
    this.down = false;
    this.raf = 0;
    this.frame = this.frame.bind(this);
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.kick();
  }

  begin(pt) { this.down = true; this.add(pt); }
  add(pt) { this.trail.push({ x: pt[0], y: pt[1], t: performance.now() }); this.kick(); }
  end() { this.down = false; this.kick(); }
  clear() { this.trail = []; this.down = false; this.kick(); }

  kick() { if (!this.raf) this.raf = requestAnimationFrame(this.frame); }

  frame() {
    this.raf = 0;
    const now = performance.now();
    // 펜을 대고 있는 동안에는 마지막 점(펜 끝)을 남겨 둡니다
    while (this.trail.length > (this.down ? 1 : 0) && now - this.trail[0].t > LASER_MS) this.trail.shift();
    const { ctx, w: W, h: H } = this;
    ctx.clearRect(0, 0, W, H);
    const tr = this.trail;
    const glow = Math.max(6, W * 0.011);
    const core = Math.max(2, W * 0.0035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 점 몇 개씩 묶어 한 번에 그립니다. 묶음마다 나이에 맞춰 흐려집니다.
    const CHUNK = 6;
    for (let i = 0; i < tr.length - 1; i += CHUNK) {
      const end = Math.min(tr.length - 1, i + CHUNK);
      const age = now - tr[Math.floor((i + end) / 2)].t;
      const a = Math.max(0, 1 - age / LASER_MS);
      if (a <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(tr[i].x * W, tr[i].y * H);
      for (let k = i + 1; k <= end; k++) ctx.lineTo(tr[k].x * W, tr[k].y * H);
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.28 * a})`;
      ctx.lineWidth = glow;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 110, 100, ${a})`;
      ctx.lineWidth = core;
      ctx.stroke();
    }
    // 펜 끝 빨간 점
    if (this.down && tr.length) {
      const p = tr[tr.length - 1];
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, glow * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 40, 40, 0.3)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, core, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a50';
      ctx.fill();
    }
    if (tr.length || this.down) this.kick();
  }
}
