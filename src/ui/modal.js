/* 화면 가운데 뜨는 대화 창: 확인, 글자 입력, 잠금 번호, 목록 고르기 */

export function openModal({ title, message = '', build = null, actions = [], onCancel = () => {} }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  const box = document.createElement('div');
  box.className = 'modal';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');

  const h = document.createElement('h2');
  h.textContent = title;
  box.append(h);
  if (message) {
    const p = document.createElement('p');
    p.textContent = message;
    box.append(p);
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function cancel() { close(); onCancel(); }
  function onKey(e) { if (e.key === 'Escape') cancel(); }

  if (build) {
    const body = document.createElement('div');
    body.className = 'modal-body';
    build(body, close);
    box.append(body);
  }

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'modal-actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '');
      b.textContent = a.label;
      b.addEventListener('click', () => {
        if (a.cancel) { cancel(); return; }
        if (a.onClick && a.onClick() === false) return;
        close();
      });
      row.append(b);
    }
    box.append(row);
  }

  back.addEventListener('pointerdown', (e) => { if (e.target === back) cancel(); });
  document.addEventListener('keydown', onKey, true);
  back.append(box);
  document.body.append(back);
  return close;
}

export function confirmModal({ title, message, ok = '확인', danger = false }) {
  return new Promise((resolve) => {
    openModal({
      title, message,
      onCancel: () => resolve(false),
      actions: [
        { label: '취소', cancel: true },
        { label: ok, primary: !danger, danger, onClick: () => resolve(true) },
      ],
    });
  });
}

export function textModal({ title, message = '', value = '', ok = '확인', maxLength = 40 }) {
  return new Promise((resolve) => {
    let input = null;
    const submit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return false; }
      resolve(v);
      return true;
    };
    const close = openModal({
      title, message,
      onCancel: () => resolve(null),
      build(body) {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.value = value;
        input.maxLength = maxLength;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && submit()) close(); });
        body.append(input);
        setTimeout(() => { input.focus(); input.select(); }, 50);
      },
      actions: [
        { label: '취소', cancel: true },
        { label: ok, primary: true, onClick: submit },
      ],
    });
  });
}

/* 숫자 네 자리 잠금 번호를 숫자판으로 받습니다. 네 자리를 다 누르면 바로 넘깁니다. */
export function pinModal({ title, message = '' }) {
  return new Promise((resolve) => {
    let pin = '';
    let dots = null;
    const close = openModal({
      title, message,
      onCancel: () => resolve(null),
      build(body) {
        dots = document.createElement('div');
        dots.className = 'pin-dots';
        dots.innerHTML = '<span></span><span></span><span></span><span></span>';
        const pad = document.createElement('div');
        pad.className = 'pin-pad';
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'cancel'];
        for (const k of keys) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pin-key';
          if (k === 'back') { b.textContent = '지우기'; b.classList.add('small'); }
          else if (k === 'cancel') { b.textContent = '취소'; b.classList.add('small'); }
          else b.textContent = k;
          b.addEventListener('click', () => {
            if (k === 'cancel') { close(); resolve(null); return; }
            if (k === 'back') pin = pin.slice(0, -1);
            else if (pin.length < 4) pin += k;
            [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
            if (pin.length === 4) { const v = pin; setTimeout(() => { close(); resolve(v); }, 120); }
          });
          pad.append(b);
        }
        body.append(dots, pad);
      },
    });
  });
}

/* 목록에서 하나를 고릅니다. items: [{ label, sub, value, current }] */
export function listModal({ title, message = '', items, empty = '목록이 비어 있습니다.' }) {
  return new Promise((resolve) => {
    openModal({
      title, message,
      onCancel: () => resolve(null),
      build(body, close) {
        const list = document.createElement('div');
        list.className = 'pick-list';
        if (!items.length) {
          const p = document.createElement('p');
          p.textContent = empty;
          list.append(p);
        }
        for (const it of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pick-item' + (it.current ? ' current' : '');
          b.innerHTML = '<span class="pick-main"></span><span class="pick-sub"></span>';
          b.querySelector('.pick-main').textContent = it.label;
          b.querySelector('.pick-sub').textContent = it.sub || '';
          b.addEventListener('click', () => { close(); resolve(it.value); });
          list.append(b);
        }
        body.append(list);
      },
      actions: [{ label: '닫기', cancel: true }],
    });
  });
}
