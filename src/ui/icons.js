/* 버튼 그림(24×24, 선 그림). 직접 그린 단순한 모양입니다. */

const PATHS = {
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  eraser: '<path d="M7 20h13"/><path d="M4.5 15.5l9-9 5 5-7.5 7.5H8z"/><path d="M9.5 10.5l5 5"/>',
  laser: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  width: '<path d="M4 6h16" stroke-width="1.2"/><path d="M4 11.5h16" stroke-width="2.6"/><path d="M4 18h16" stroke-width="4.6"/>',
  select: '<path d="M5 9c1-4 11-6 14-2s-1 9-6 9-9-3-8-7z" stroke-dasharray="2.5 2.5"/><path d="M14 15l2 6 1.6-2.6L20.5 18z" fill="currentColor"/>',
  undo: '<path d="M9 13L4 8l5-5"/><path d="M4 8h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 13l5-5-5-5"/><path d="M20 8H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fullscreenExit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
}
