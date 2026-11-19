/* 칠판 캔버스
   - 배경층(bg): 칠판 무늬, 나중에 PDF·이미지
   - 판서층(ink): 다 그은 선
   - 진행 중 층(live): 그리는 중인 선, 고리, 레이저

   진행 중 층은 불투명 저지연 캔버스(desynchronized, alpha: false)이고 화면에 보이는 유일한 캔버스입니다.
   투명한 저지연 캔버스는 갤럭시탭 S11 울트라의 크롬·웨일에서 투명한 곳이 검게 나와 칠판을 가렸습니다(0-B 시험).
   그래서 배경층과 판서층은 화면 밖 캔버스로 두고, 진행 중 층에 복사한 뒤 그 위에 그리는 중인 것만 덧그립니다. */

export const BACKGROUNDS = {
  chalk: '#1d3b2f',
  white: '#ffffff',
};

export class BoardCanvas {
  constructor(host) {
    this.host = host;
    this.bg = document.createElement('canvas');
    this.bgCtx = this.bg.getContext('2d', { alpha: false });
    this.ink = document.createElement('canvas');
    this.inkCtx = this.ink.getContext('2d');
    this.live = null;
    this.liveCtx = null;
    this.lowLatency = false;   // 저지연이 실제로 적용되었는지
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.background = 'chalk';
    this.onRedrawInk = () => {};   // 크기가 바뀌면 판서층을 다시 그리도록 main.js가 채웁니다
  }

  /* 배경·판서층을 모두 다시 그려 화면에 보입니다(크기 변경, 선 불러오기, 형광 선 추가 때). */
  redrawAll() {
    if (!this.w) return;
    this.onRedrawInk(this.inkCtx, this.w, this.h);
    this.compose();
  }

  /* 진행 중 층의 한 구역을 배경·판서층으로 되돌립니다. 그리는 중인 선을 다시 그리기 전에 씁니다. */
  restoreRegion(box) {
    if (!this.liveCtx || !box) return;
    const d = this.dpr;
    const x0 = Math.max(0, Math.floor(box.x * d));
    const y0 = Math.max(0, Math.floor(box.y * d));
    const x1 = Math.min(this.bg.width, Math.ceil((box.x + box.w) * d));
    const y1 = Math.min(this.bg.height, Math.ceil((box.y + box.h) * d));
    if (x1 <= x0 || y1 <= y0) return;
    const sw = x1 - x0, sh = y1 - y0;
    this.liveCtx.drawImage(this.bg, x0, y0, sw, sh, x0 / d, y0 / d, sw / d, sh / d);
    this.liveCtx.drawImage(this.ink, x0, y0, sw, sh, x0 / d, y0 / d, sw / d, sh / d);
  }

  resize(w, h, dpr) {
    if (!w || !h) return;
    this.w = w; this.h = h; this.dpr = dpr;
    for (const [cv, ctx] of [[this.bg, this.bgCtx], [this.ink, this.inkCtx]]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.createLive();
    this.paintBackground();
    this.redrawAll();
  }

  /* 진행 중 층은 크기가 바뀔 때마다, 칠판이 보이는 상태에서 새로 만듭니다. */
  createLive() {
    const c = document.createElement('canvas');
    c.className = 'live-layer';
    let ctx = null;
    try { ctx = c.getContext('2d', { desynchronized: true, alpha: false }); } catch (_) { ctx = null; }
    if (!ctx) ctx = c.getContext('2d', { alpha: false });
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 처음에는 맨 앞에 넣어, 레이저 층처럼 나중에 얹는 캔버스가 위에 오게 합니다
    if (this.live) this.live.replaceWith(c); else this.host.prepend(c);
    this.live = c;
    this.liveCtx = ctx;
    try {
      const at = ctx.getContextAttributes ? ctx.getContextAttributes() : null;
      this.lowLatency = !!(at && at.desynchronized);
    } catch (_) { this.lowLatency = false; }
  }

  paintBackground() {
    this.bgCtx.fillStyle = BACKGROUNDS[this.background] || BACKGROUNDS.chalk;
    this.bgCtx.fillRect(0, 0, this.w, this.h);
  }

  /* 배경층과 판서층을 진행 중 층에 복사합니다. 그리는 중인 것은 이 뒤에 덧그립니다. */
  compose() {
    if (!this.liveCtx) return;
    this.liveCtx.drawImage(this.bg, 0, 0, this.w, this.h);
    this.liveCtx.drawImage(this.ink, 0, 0, this.w, this.h);
  }
}
