/* 보조 메뉴 서랍
   왼쪽·오른쪽 손잡이 어느 쪽을 눌러도 같은 서랍이 그쪽에서 열립니다. */

import { icon } from './icons.js';
import { laterToast } from './toast.js';

const SECTIONS = [
  { title: '자료', items: [
    { label: 'PDF 열기', later: 's3' },
    { label: '이미지 불러오기', later: 's3' },
    { label: '카메라 촬영', later: 's3' },
    { label: '배경 바꾸기', later: 's2' },
  ] },
  { title: '공유', items: [
    { label: 'PC 공유 켜기', later: 's4' },
  ] },
  { title: '수업', items: [
    { label: '새 수업', later: 'next' },
    { label: '수업 열기', later: 'next' },
    { label: '이 쪽 모두 지우기', later: 'next' },
    { label: '수업 종료', later: 's4' },
  ] },
  { title: '설정', items: [
    { label: '잠금 번호', later: 'next' },
    { label: '손가락으로도 쓰기', later: 'next' },
    { label: '지운 뒤 펜 복귀', later: 'next' },
  ] },
];

const DISPLAY_MODES = [
  ['fullscreen', '전체화면 앱'],
  ['standalone', '설치한 앱'],
  ['minimal-ui', '설치한 앱(간단 화면)'],
  ['browser', '브라우저'],
];

export function buildDrawer() {
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');

  const head = document.createElement('div');
  head.className = 'drawer-head';
  head.innerHTML = `<strong>보조 메뉴</strong><button type="button" class="tool small" aria-label="닫기" title="닫기">${icon('close')}</button>`;
  drawer.append(head);

  for (const sec of SECTIONS) {
    const box = document.createElement('section');
    box.innerHTML = `<h2>${sec.title}</h2>`;
    for (const it of sec.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item';
      b.textContent = it.label;
      b.addEventListener('click', () => laterToast(it.later));
      box.append(b);
    }
    drawer.append(box);
  }

  const info = document.createElement('section');
  info.innerHTML = '<h2>화면 정보</h2><dl id="screen-info"></dl>';
  drawer.append(info);

  function open(side) {
    drawer.classList.toggle('from-right', side === 'right');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
  }
  function close() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
  }

  const left = document.getElementById('handle-left');
  const right = document.getElementById('handle-right');
  left.innerHTML = icon('next');
  right.innerHTML = icon('prev');
  left.addEventListener('click', () => open('left'));
  right.addEventListener('click', () => open('right'));
  backdrop.addEventListener('click', close);
  head.querySelector('button').addEventListener('click', close);

  return {
    updateInfo(layout, board) {
      const mode = DISPLAY_MODES.find(([m]) => window.matchMedia(`(display-mode: ${m})`).matches);
      const dpr = window.devicePixelRatio || 1;
      const rows = [
        ['화면', `${layout.vw}×${layout.vh} (배율 ${Math.round(dpr * 100) / 100})`],
        ['칠판', `${layout.bw}×${layout.bh}`],
        ['위 띠', `${layout.top}px`],
        ['아래 띠', `${layout.bottom}px`],
        ['표시 방식', mode ? mode[1] : '알 수 없음'],
        ['저지연 화면', board.lowLatency ? '적용됨(불투명)' : '적용 안 됨'],
        ['판', `${__APP_VERSION__} · ${new Date(__BUILD_TIME__).toLocaleString('ko-KR')}`],
      ];
      const dl = document.getElementById('screen-info');
      dl.replaceChildren();
      for (const [k, v] of rows) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
      }
    },
  };
}
