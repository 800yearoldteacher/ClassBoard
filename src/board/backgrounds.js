/* 칠판 배경 무늬
   칠판 · 흰 판 · 모눈 · 줄 공책 · 깍두기 공책. 칸 크기와 줄 수는 칠판 크기에 대한 비율이라 TV에서도 같은 모양입니다.
   흰 판만 흰 바탕이고, 무늬 배경은 초록 칠판 위에 옅은 흰 선으로 그립니다(2-3 시험 뒤 사용자 결정).
   3단계에서 PDF·이미지 배경(type 'pdf' | 'image')을 더합니다. */

export const BG_TYPES = [
  { type: 'chalk', name: '칠판' },
  { type: 'white', name: '흰 판' },
  { type: 'grid', name: '모눈' },
  { type: 'lined', name: '줄 공책' },
  { type: 'kkak', name: '깍두기 공책' },
];

const CHALK = '#1d3b2f';
const PAPER = '#fbfbf7';

export function isDark(bg) { return !bg || bg.type !== 'white'; }
export function baseColor(bg) { return isDark(bg) ? CHALK : PAPER; }
export function bgName(bg) { return (BG_TYPES.find((b) => b.type === (bg && bg.type)) || BG_TYPES[0]).name; }

function lines(ctx, list, color, width, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of list) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  ctx.stroke();
  ctx.restore();
}

/* 칠판 크기 W×H(화면 단위)에 배경을 그립니다. */
export function paintBackground(ctx, bg, W, H) {
  ctx.fillStyle = baseColor(bg);
  ctx.fillRect(0, 0, W, H);
  const type = bg && bg.type;
  const thin = Math.max(1, W / 1600);

  if (type === 'grid') {
    // 모눈: 가로 40칸의 옅은 작은 칸
    const cell = W / 40;
    const list = [];
    for (let x = cell; x < W; x += cell) list.push([x, 0, x, H]);
    for (let y = cell; y < H; y += cell) list.push([0, y, W, y]);
    lines(ctx, list, 'rgba(255, 255, 255, 0.13)', thin);
  } else if (type === 'lined') {
    // 줄 공책: 칠판 높이를 14줄로 나눈 가로줄
    const gap = H / 14;
    const list = [];
    for (let y = gap; y < H - 1; y += gap) list.push([0, y, W, y]);
    lines(ctx, list, 'rgba(255, 255, 255, 0.25)', thin * 1.3);
  } else if (type === 'kkak') {
    // 깍두기 공책: 가로 16칸 × 세로 9칸의 큰 정사각형, 칸 가운데에 옅은 점선 십자
    const cell = W / 16;
    const rows = Math.round(H / cell);
    const ch = H / rows;
    const solid = [];
    const dotted = [];
    for (let i = 1; i < 16; i++) solid.push([i * cell, 0, i * cell, H]);
    for (let j = 1; j < rows; j++) solid.push([0, j * ch, W, j * ch]);
    for (let i = 0; i < 16; i++) dotted.push([(i + 0.5) * cell, 0, (i + 0.5) * cell, H]);
    for (let j = 0; j < rows; j++) dotted.push([0, (j + 0.5) * ch, W, (j + 0.5) * ch]);
    lines(ctx, dotted, 'rgba(255, 255, 255, 0.14)', thin, [thin * 4, thin * 4]);
    lines(ctx, solid, 'rgba(255, 255, 255, 0.3)', thin * 1.6);
  }
}
