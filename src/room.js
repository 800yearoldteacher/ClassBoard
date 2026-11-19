/* 수업 방 공통: Firebase 웹 설정값(공개되어도 되는 값입니다).
   쓰기 권한은 database.rules.json의 보안 규칙이 막습니다. 수업 방은 만든 기기(익명 로그인 uid)만 쓸 수 있습니다. */
export const firebaseConfig = {
  apiKey: 'AIzaSyB3JRlgKQfgkT27jUlEfpOpq9BoZdXEk4o',
  authDomain: 'classboard-a6373.firebaseapp.com',
  databaseURL: 'https://classboard-a6373-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'classboard-a6373',
  storageBucket: 'classboard-a6373.firebasestorage.app',
  messagingSenderId: '460091129790',
  appId: '1:460091129790:web:495418984a8abc0218c3ef',
};

/* 수업 방 코드: 영문 소문자·숫자 16자리(보안 규칙과 같은 형식) */
export const ROOM_RE = /^[a-z0-9]{16}$/;

/* 선 점 목록을 짧은 글자로 바꿉니다. 소수 넷째 자리(칠판 너비의 1만분의 1)까지 씁니다.
   [[x, y, 필압], ...] ↔ "x,y,p;x,y,p;..." (x·y는 ×10000, 필압은 ×100 정수) */
export function encodePts(pts) {
  return pts.map((p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 100)}`).join(';');
}
export function decodePts(text) {
  if (!text) return [];
  return text.split(';').map((t) => {
    const [x, y, p] = t.split(',');
    return [Number(x) / 1e4, Number(y) / 1e4, Number(p) / 100];
  });
}

/* 수업 방에 올리는 선 한 줄 */
export function strokeToRoom(s) {
  return { seq: s.seq, tool: s.tool, color: s.color, w: s.w, sim: !!s.sim, p: encodePts(s.pts) };
}
export function strokeFromRoom(id, r) {
  return { id, seq: r.seq, tool: r.tool, color: r.color, w: r.w, sim: !!r.sim, pts: decodePts(r.p) };
}
