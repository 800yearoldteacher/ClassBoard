/* 고리 판정(지우개·선택 공통)
   선의 일부라도 고리 안에 들어오거나 고리 선과 엇갈리면 묶인 것으로 봅니다(2-1 시험 뒤 사용자 결정).
   좌표는 모두 칠판 기준 비율(0~1)입니다. */

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/* 두 선분 ab, cd가 엇갈리는지 */
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function boxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

function touches(s, poly, pb) {
  const pts = s.pts;
  // 1) 점 하나라도 고리 안에 있으면 묶입니다
  for (const p of pts) {
    if (p[0] < pb[0] || p[0] > pb[2] || p[1] < pb[1] || p[1] > pb[3]) continue;
    if (inPoly(p[0], p[1], poly)) return true;
  }
  // 2) 점은 모두 밖이어도, 선이 고리 선을 가로지르면 묶입니다(점 사이가 먼 직선 등)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.max(a[0], b[0]) < pb[0] || Math.min(a[0], b[0]) > pb[2] || Math.max(a[1], b[1]) < pb[1] || Math.min(a[1], b[1]) > pb[3]) continue;
    for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
      if (cross(a[0], a[1], b[0], b[1], poly[k][0], poly[k][1], poly[j][0], poly[j][1])) return true;
    }
  }
  return false;
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
    if (touches(s, poly, pb)) hit.push(s);
  }
  return hit;
}
