import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const BASE = '/ClassBoard/';   // GitHub Pages 주소의 저장소 이름

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',          // 수업 중 저절로 새로 고침되지 않도록, 새 판은 안내만 합니다
      injectRegister: false,           // main.js에서 직접 등록합니다
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'ClassBoard',
        short_name: 'ClassBoard',
        description: '갤럭시탭 S펜 판서를 교실 PC에 실시간으로 보여 주는 전자칠판형 웹앱',
        lang: 'ko',
        start_url: BASE,
        scope: BASE,
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#14181c',
        theme_color: '#14181c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // mjs: PDF 그리기 부품, bcmap·pfb·ttf: pdf.js 글자 자료(인터넷 없이 PDF를 열기 위해 함께 저장)
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff2,bcmap,pfb,ttf}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/prototypes\//],   // 0단계 시험 페이지는 앱이 가로채지 않습니다
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
