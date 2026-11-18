/* 화면 배치 계산
   칠판은 16:9로 고정하고, 남는 위아래를 띠로 씁니다.
   띠가 MIN_BAND보다 좁은 화면(16:9 PC 등)에서는 칠판을 줄여 띠를 확보합니다. */

export const MIN_BAND = 44;

export function computeLayout(vw, vh) {
  let bw = vw;
  let bh = (vw * 9) / 16;
  if ((vh - bh) / 2 < MIN_BAND) {
    bh = Math.max(0, vh - MIN_BAND * 2);
    bw = (bh * 16) / 9;
  }
  bw = Math.floor(bw);
  bh = Math.floor(bh);
  const bx = Math.floor((vw - bw) / 2);
  const top = Math.floor((vh - bh) / 2);
  const bottom = vh - top - bh;
  return { vw, vh, bw, bh, bx, by: top, top, bottom };
}
