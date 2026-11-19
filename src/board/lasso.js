/* 고리 판정
   선의 점 가운데 절반 이상이 고리 안에 있으면 묶인 것으로 봅니다(0-A와 같은 기준).
   좌표는 모두 칠판 기준 비율(0~1)입니다. */

const RATIO = 0.5;

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

/* 고리에 묶인 선 목록. 선마다 범위를 먼저 비교해 멀리 있는 선은 건너뜁니다(선 2,000개 대비). */
export function strokesInLasso(strokes, poly) {
  if (poly.length < 3) return [];
  const pb = boxOf(poly);
  const hit = [];
  for (const s of strokes) {
    if (!s._bb) s._bb = boxOf(s.pts);
    const b = s._bb;
    if (b[2] < pb[0] || b[0] > pb[2] || b[3] < pb[1] || b[1] > pb[3]) continue;
    let n = 0;
    for (const p of s.pts) if (inPoly(p[0], p[1], poly)) n += 1;
    if (n >= s.pts.length * RATIO) hit.push(s);
  }
  return hit;
}
