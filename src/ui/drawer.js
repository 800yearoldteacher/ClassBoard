/* 보조 메뉴 서랍
   왼쪽·오른쪽 손잡이 어느 쪽을 눌러도 같은 서랍이 그쪽에서 열립니다.
   sections: [{ title, intro?: () => 글, items: [{ label, later?, onClick?, toggle?: () => 켬 여부 }] }] */

import { icon } from './icons.js';
import { laterToast } from './toast.js';

const DISPLAY_MODES = [
  ['fullscreen', '전체화면 앱'],
  ['standalone', '설치한 앱'],
  ['minimal-ui', '설치한 앱(간단 화면)'],
  ['browser', '브라우저'],
];

export function buildDrawer({ sections, onOpen = () => {}, onClose = () => {} }) {
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');
  const refreshers = [];

  const head = document.createElement('div');
  head.className = 'drawer-head';
  head.innerHTML = `<strong>보조 메뉴</strong><button type="button" class="tool small" aria-label="닫기" title="닫기">${icon('close')}</button>`;
  drawer.append(head);

  for (const sec of sections) {
    const box = document.createElement('section');
    const h = document.createElement('h2');
    h.textContent = sec.title;
    box.append(h);
    if (sec.intro) {
      const p = document.createElement('p');
      p.className = 'lesson-now';
      box.append(p);
      refreshers.push(() => { p.innerHTML = sec.intro(); });
    }
    for (const it of sec.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item';
      const label = document.createElement('span');
      label.textContent = it.label;
      b.append(label);
      if (it.toggle) {
        const st = document.createElement('span');
        st.className = 'state';
        b.append(st);
        refreshers.push(() => {
          const on = !!it.toggle();
          st.textContent = on ? '켬' : '끔';
          st.classList.toggle('on', on);
        });
      }
      b.addEventListener('click', async () => {
        if (it.onClick) { await it.onClick(); refresh(); } else laterToast(it.later);
      });
      box.append(b);
    }
    drawer.append(box);
  }

  const info = document.createElement('section');
  info.innerHTML = '<h2>화면 정보</h2><dl id="screen-info"></dl>';
  drawer.append(info);

  function refresh() { for (const r of refreshers) r(); }

  function open(side) {
    onOpen();
    refresh();
    // 지난번과 다른 쪽에서 열 때는 애니메이션 없이 먼저 그쪽 화면 밖으로 옮겨 둔 뒤 미끄러져 들어오게 합니다.
    // 옮기기와 열기를 한꺼번에 하면 반대쪽(화면 안쪽)에서 튀어나오는 것처럼 보였습니다(0.15.0).
    const fromRight = side === 'right';
    if (drawer.classList.contains('from-right') !== fromRight) {
      drawer.style.transition = 'none';
      drawer.classList.toggle('from-right', fromRight);
      void drawer.offsetWidth;   // 옮긴 위치를 먼저 확정합니다
      drawer.style.transition = '';
    }
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
  }
  function close() {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    onClose();
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
    close,
    refresh,
    updateInfo(layout, board, stats) {
      if (!layout) return;
      const mode = DISPLAY_MODES.find(([m]) => window.matchMedia(`(display-mode: ${m})`).matches);
      const dpr = window.devicePixelRatio || 1;
      const rows = [
        ['화면', `${layout.vw}×${layout.vh} (배율 ${Math.round(dpr * 100) / 100})`],
        ['칠판', `${layout.bw}×${layout.bh}`],
        ['위 띠', `${layout.top}px`],
        ['아래 띠', `${layout.bottom}px`],
        ['표시 방식', mode ? mode[1] : '알 수 없음'],
        ['저지연 화면', board.lowLatency ? '적용됨(불투명)' : '적용 안 됨'],
        ['펜 처리 시간', stats && stats.lastEvents
          ? `움직일 때 평균 ${stats.lastAvg.toFixed(2)}ms · 최대 ${stats.lastMax.toFixed(1)}ms · 뗄 때 ${(stats.commitMs || 0).toFixed(1)}ms (마지막 선, ${stats.lastEvents}회)`
          : '아직 없음(선을 하나 그은 뒤 다시 엽니다)'],
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
