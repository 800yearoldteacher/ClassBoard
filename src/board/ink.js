/* 선 모양과 판서층 그리기
   perfect-freehand로 필압을 반영한 선 테두리를 만들고 채워서 그립니다(0-A 시험 페이지와 같은 설정).
   좌표는 칠판 기준 비율(0~1), 굵기는 칠판 너비 기준 비율입니다. */

import { getStroke } from 'perfect-freehand';

export const COLORS = [
  { name: '흰색', c: '#ffffff' },
  { name: '검정', c: '#1d1d1f' },
  { name: '빨강', c: '#ff4b4b' },
  { name: '파랑', c: '#2f7cff' },
  { name: '초록', c: '#24a865' },
  { name: '노랑', c: '#ffd23a' },
  { name: '형광 노랑', c: 'rgba(255, 236, 61, 0.42)', swatch: '#ffec3d', hl: true },
  { name: '형광 분홍', c: 'rgba(255, 88, 170, 0.38)', swatch: '#ff58aa', hl: true },
];

export const SIZES = [
  { name: '가늘게', w: 0.0025 },
  { name: '보통', w: 0.004 },
  { name: '굵게', w: 0.0065 },
  { name: '아주 굵게', w: 0.01 },
];

const HL_SCALE = 3;   // 형광펜은 같은 굵기 단계에서 세 배 굵게 그립니다

/* ---------- 그리는 중 미리보기 ----------
   펜이 움직일 때마다 선 전체 모양을 다시 계산하면 태블릿에서 처리가 밀려 선이 늦게 나왔습니다(1-2 시험).
   그리는 동안에는 새로 들어온 짧은 조각만 둥근 선으로 덧그리고, 펜을 떼면 완성 모양으로 바꿉니다.
   조각 굵기는 perfect-freehand의 굵기 계산과 같게 맞춥니다. */
export function previewWidth(st, p, W) {
  const size = st.w * W;
  if (st.tool === 'hl') return Math.max(1, size * HL_SCALE);
  const thinning = st.sim ? 0.45 : 0.6;
  return Math.max(1, size * (1 - 2 * thinning * (0.5 - p)));
}

/* 반투명 형광색은 조각이 겹치는 곳마다 진해지므로, 미리보기는 칠판 바탕에 섞은 불투명한 색으로 그립니다. */
export function previewColor(st, bgHex) {
  if (st.tool !== 'hl') return st.color;
  const m = /rgba?\(([^)]+)\)/.exec(st.color);
  if (!m) return st.color;
  const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v));
  const bg = parseInt(bgHex.slice(1), 16);
  const mix = (c, bc) => Math.round(c * a + bc * (1 - a));
  return `rgb(${mix(r, (bg >> 16) & 255)}, ${mix(g, (bg >> 8) & 255)}, ${mix(b, bg & 255)})`;
}

export function strokeBounds(s, W, H) {
  return bounds(outline(s.pts, s, W, H, true));
}

/* 선 테두리 점 목록(칠판 화면 크기 W×H 기준) */
export function outline(pts, st, W, H, last) {
  const size = Math.max(1, st.w * W * (st.tool === 'hl' ? HL_SCALE : 1));
  return getStroke(pts.map((p) => [p[0] * W, p[1] * H, p[2]]), {
    size,
    thinning: st.tool === 'hl' ? 0 : (st.sim ? 0.45 : 0.6),
    smoothing: 0.5,
    streamline: 0.32,
    simulatePressure: !!st.sim,   // 손가락·마우스는 필압이 없어 속도로 흉내 냅니다
    last,
  });
}

export function toPath(o) {
  const p = new Path2D();
  const n = o.length;
  if (n < 2) return p;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(o[0], o[1]);
  p.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const a = o[i % n];
    const m = mid(a, o[(i + 1) % n]);
    p.quadraticCurveTo(a[0], a[1], m[0], m[1]);
  }
  p.closePath();
  return p;
}

export function bounds(o, pad = 2) {
  if (!o.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of o) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export function union(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/* 다 그은 선의 모양은 칠판 크기가 같으면 다시 계산하지 않습니다. */
function strokePath(s, W, H) {
  const key = `${W}x${H}`;
  if (!s._path || s._key !== key) {
    s._path = toPath(outline(s.pts, s, W, H, true));
    s._key = key;
  }
  return s._path;
}

export function paintStroke(ctx, s, W, H) {
  ctx.fillStyle = s.color;
  ctx.fill(strokePath(s, W, H));
}

/* 판서층 전체를 다시 그립니다. 형광 선을 먼저 그려 글씨 아래에 깔리게 합니다. */
export function redrawInk(ctx, strokes, W, H) {
  ctx.clearRect(0, 0, W, H);
  for (const s of strokes) if (s.tool === 'hl') paintStroke(ctx, s, W, H);
  for (const s of strokes) if (s.tool !== 'hl') paintStroke(ctx, s, W, H);
}

/* 저장할 때는 화면용으로 덧붙인 값(_path 등)을 뺍니다. */
export function toRecord(s) {
  const { id, pageId, seq, tool, color, w, sim, pts } = s;
  return { id, pageId, seq, tool, color, w, sim, pts };
}
