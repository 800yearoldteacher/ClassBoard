/* 위쪽 띠의 필수 판서 메뉴와 아래쪽 띠의 쪽 막대
   필수 메뉴 순서: 펜/지우개 · 레이저 · 굵기 · 색깔 · 선택 · 되돌리기 · 다시하기
   쪽 막대 순서: 이전 · 현재/전체 · 다음 · 쪽 추가 · 전체화면 */

import { icon } from './icons.js';
import { laterToast } from './toast.js';

const TOOLS = [
  { id: 'tool-pen', label: '펜/지우개', icon: 'pen', later: 'next', pressed: true },
  { id: 'tool-laser', label: '레이저', icon: 'laser', later: 'next' },
  { id: 'tool-width', label: '굵기', icon: 'width', later: 'next' },
  { id: 'tool-color', label: '색깔', html: '<span class="swatch" style="--c:#ffffff"></span>', later: 'next' },
  { id: 'tool-select', label: '선택', icon: 'select', later: 's2' },
  { gap: true },
  { id: 'tool-undo', label: '되돌리기', icon: 'undo', later: 'next' },
  { id: 'tool-redo', label: '다시하기', icon: 'redo', later: 'next' },
];

const PAGES = [
  { id: 'page-prev', label: '이전 쪽', icon: 'prev', later: 'next' },
  { id: 'page-count', label: '쪽 관리', text: '1 / 1', later: 's2', wide: true },
  { id: 'page-next', label: '다음 쪽', icon: 'next', later: 'next' },
  { id: 'page-add', label: '쪽 추가', icon: 'add', later: 'next' },
  { gap: true },
  { id: 'page-fullscreen', label: '전체화면', icon: 'fullscreen', later: 's2' },
];

function makeButtons(host, items, handlers = {}) {
  for (const it of items) {
    if (it.gap) {
      const g = document.createElement('span');
      g.className = 'gap';
      host.append(g);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.id = it.id;
    b.className = 'tool' + (it.wide ? ' wide' : '');
    b.title = it.label;
    b.setAttribute('aria-label', it.label);
    if (it.pressed !== undefined) b.setAttribute('aria-pressed', String(!!it.pressed));
    b.innerHTML = it.icon ? icon(it.icon) : it.html || `<span class="count">${it.text}</span>`;
    const handler = handlers[it.id];
    if (handler) b.addEventListener('click', () => handler(b));
    else if (it.later) b.addEventListener('click', () => laterToast(it.later));
    host.append(b);
  }
}

/* handlers: { 버튼 id: 누를 때 할 일 }. 없으면 '다음에 만듭니다' 안내를 띄웁니다. */
export function buildToolbar(host, handlers) { makeButtons(host, TOOLS, handlers); }
export function buildPagebar(host, handlers) { makeButtons(host, PAGES, handlers); }
