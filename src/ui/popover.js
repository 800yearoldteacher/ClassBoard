/* 메뉴 버튼 아래에 잠깐 뜨는 작은 선택 창(굵기, 색깔) */

let current = null;

export function closePopover() {
  if (!current) return;
  current.el.remove();
  document.removeEventListener('pointerdown', current.outside, true);
  current.anchor.setAttribute('aria-expanded', 'false');
  current = null;
}

export function openPopover(anchor, build) {
  const same = current && current.anchor === anchor;
  closePopover();
  if (same) return;   // 같은 버튼을 다시 누르면 닫기만 합니다

  const el = document.createElement('div');
  el.className = 'popover';
  el.setAttribute('role', 'dialog');
  build(el, closePopover);
  document.body.append(el);

  const a = anchor.getBoundingClientRect();
  const top = document.getElementById('topband').getBoundingClientRect().bottom + 6;
  const w = el.offsetWidth;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, a.left + a.width / 2 - w / 2));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const outside = (e) => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closePopover();
  };
  document.addEventListener('pointerdown', outside, true);
  anchor.setAttribute('aria-expanded', 'true');
  current = { el, anchor, outside };
}
