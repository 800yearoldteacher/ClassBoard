// pdf.js가 PDF를 그릴 때 쓰는 글자 대응표(cmaps)와 기본 글꼴(standard_fonts)을 public/pdfjs/로 복사합니다.
// 글꼴을 품지 않은 PDF(일부 한글 문서 등)도 바르게 그리고, 인터넷 없이도 열리게 하려는 것입니다.
// npm run dev / npm run build 전에 저절로 실행됩니다(package.json의 predev, prebuild).
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist');
const to = join(root, 'public', 'pdfjs');
mkdirSync(to, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(from, dir), join(to, dir), { recursive: true });
}
console.log('pdf.js 글자 자료를 public/pdfjs/에 복사했습니다.');
