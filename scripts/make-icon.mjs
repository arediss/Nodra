// Rasterize a macOS-style squircle app icon (rounded rect + brand diamond) to a
// 1024×1024 PNG (transparent margins) — the source for `tauri icon`.
import { chromium } from 'playwright';

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b93ff"/>
      <stop offset="1" stop-color="#0a66ec"/>
    </linearGradient>
    <linearGradient id="dia" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dce8ff"/>
    </linearGradient>
    <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#06367a" flood-opacity="0.45"/>
    </filter>
  </defs>
  <!-- transparent canvas; macOS squircle fills ~80% centered -->
  <rect x="104" y="104" width="816" height="816" rx="188" ry="188" fill="url(#tile)"/>
  <!-- subtle top sheen -->
  <rect x="104" y="104" width="816" height="408" rx="188" ry="188" fill="#ffffff" opacity="0.08"/>
  <!-- brand diamond -->
  <path d="M512 300 L724 512 L512 724 L300 512 Z" fill="url(#dia)" filter="url(#ds)"/>
  <path d="M512 408 L616 512 L512 616 L408 512 Z" fill="#0a66ec" opacity="0.92"/>
  <circle cx="512" cy="512" r="40" fill="#ffffff"/>
</svg>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 1024, height: 1024 },
});
// transparent page background so the squircle margins stay transparent
await page.setContent(
  `<body style="margin:0;background:transparent">${SVG}</body>`,
);
await page.locator('svg').screenshot({
  path: '/tmp/pfd-icon.png',
  omitBackground: true,
});
await browser.close();
console.log('wrote /tmp/pfd-icon.png (transparent squircle)');
