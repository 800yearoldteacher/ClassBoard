/* 4자리 설정 잠금
   학생이 만져서 수업 파일이나 설정이 바뀌는 일을 막는 용도입니다(보안 장치는 아닙니다).
   번호 자체는 저장하지 않고, 번호로 만든 해시(되돌릴 수 없는 요약 값)만 저장합니다. */

export async function hashPin(pin) {
  const data = new TextEncoder().encode(`classboard-lock:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
