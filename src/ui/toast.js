/* 화면 아래쪽에 잠깐 뜨는 안내 */

let timer = 0;

export function toast(message, { action = null, duration = 3000 } = {}) {
  const el = document.getElementById('toast');
  el.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { el.hidden = true; action.onClick(); });
    el.append(btn);
  }
  el.hidden = false;
  clearTimeout(timer);
  if (duration > 0) timer = setTimeout(() => { el.hidden = true; }, duration);
}

/* 아직 만들지 않은 기능을 눌렀을 때 */
const LATER = {
  next: '1단계의 다음 묶음에서',
  s2: '2단계에서',
  s3: '3단계에서',
  s4: '4단계에서',
};
export function laterToast(when) {
  toast(`이 기능은 ${LATER[when] || '다음 단계에서'} 만듭니다.`);
}
