/* 이 기기에서만 기억하는 작은 설정(고른 굵기·색깔). 저장이 안 되는 환경이면 기본값을 씁니다. */

const KEY = 'classboard-prefs';
const DEFAULTS = { sizeIdx: 1, colorIdx: 0, pressure: true, pinchZoom: true };   // 보통 굵기, 흰색, 필압 반영, 손가락 확대

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) { /* 무시합니다 */ }
}
