/* 되돌리기·다시하기 기록
   쪽마다 따로 기록합니다. 지금 보고 있는 쪽에서 한 일만 되돌립니다.
   기록 하나: { type: 'add' | 'erase', strokes: [선...] }  (2단계에서 'move'를 더합니다)
   기록은 앱을 켜 둔 동안만 남습니다. */

const LIMIT = 300;

export class History {
  constructor() {
    this.pages = new Map();
  }

  stack(pageId) {
    if (!this.pages.has(pageId)) this.pages.set(pageId, { undo: [], redo: [] });
    return this.pages.get(pageId);
  }

  push(pageId, action) {
    const s = this.stack(pageId);
    s.undo.push(action);
    if (s.undo.length > LIMIT) s.undo.shift();
    s.redo.length = 0;
  }

  undo(pageId) {
    const s = this.stack(pageId);
    const a = s.undo.pop();
    if (a) s.redo.push(a);
    return a;
  }

  redo(pageId) {
    const s = this.stack(pageId);
    const a = s.redo.pop();
    if (a) s.undo.push(a);
    return a;
  }

  forget(pageId) { this.pages.delete(pageId); }   // 쪽을 지웠을 때

  canUndo(pageId) { return this.stack(pageId).undo.length > 0; }
  canRedo(pageId) { return this.stack(pageId).redo.length > 0; }
}
