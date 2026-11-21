/* 레이저 포인터
   펜이 지나간 길을 또렷한 빨간 선으로 보여 주고, 각 부분은 약 1.5초에 걸쳐 점점 가늘어지다 사라집니다.
   빛 번짐(옅고 굵은 띠)은 지저분해 보여 없앴고, 반투명 조각의 이음매에 진한 점이 생기지 않도록
   흐려지는 대신 불투명한 채로 가늘어지게 했습니다(0.15.0).
   저장하지 않고 되돌리기 대상도 아닙니다.
   매 화면마다 빛줄기를 다시 그려야 하므로, 불투명한 진행 중 층 위에 따로 얹은 투명한 일반 캔버스에 그립니다.
   (검게 덮이는 문제는 투명한 '저지연' 캔버스에서만 생겼습니다.) */

export const LASER_MS = 1500;

export class Laser {
  /* getView: 칠판 확대 상태 { z, x, y }를 돌려주는 함수(확대해도 펜 끝을 따라가게 합니다) */
  constructor(host, getView = () => ({ z: 1, x: 0, y: 0 })) {
    this.getView = getView;
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

  /* 새로 펜을 댄 점에는 start 표시를 붙여, 이전 획의 잔상 끝과 잇지 않습니다. */
  begin(pt) { this.down = true; this.add(pt, true); }
  add(pt, start = false) { this.trail.push({ x: pt[0], y: pt[1], t: performance.now(), start }); this.kick(); }
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
    const { z, x: vx, y: vy } = this.getView();
    const sx = (p) => (p.x - vx) * z * W;
    const sy = (p) => (p.y - vy) * z * H;
    const core = Math.max(3, W * 0.004);
    const COLOR = '#ff3b30';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLOR;
    // 점 몇 개씩 묶어 한 번에 그립니다. 묶음마다 나이에 맞춰 가늘어집니다.
    const CHUNK = 3;
    for (let i = 0; i < tr.length - 1; i += CHUNK) {
      const end = Math.min(tr.length - 1, i + CHUNK);
      const age = now - tr[Math.floor((i + end) / 2)].t;
      const lw = core * Math.max(0, 1 - age / LASER_MS);
      if (lw < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(sx(tr[i]), sy(tr[i]));
      for (let k = i + 1; k <= end; k++) {
        if (tr[k].start) ctx.moveTo(sx(tr[k]), sy(tr[k]));   // 새 획이 시작되는 곳에서는 선을 끊습니다
        else ctx.lineTo(sx(tr[k]), sy(tr[k]));
      }
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    // 펜 끝 빨간 점(번짐 없이 또렷하게)
    if (this.down && tr.length) {
      const p = tr[tr.length - 1];
      ctx.beginPath();
      ctx.arc(sx(p), sy(p), core * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = COLOR;
      ctx.fill();
    }
    if (tr.length || this.down) this.kick();
  }
}
