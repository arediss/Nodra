// Headless smoke-drive via system Microsoft Edge (Playwright `msedge` channel).
import { chromium } from 'playwright';
const URL = 'http://localhost:5173';
const OUT = '/tmp';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.app', { timeout: 15000 });
await page.waitForTimeout(700);

// load example via Settings
await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForSelector('.sheet', { timeout: 4000 });
await page.getByRole('button', { name: /Charger l'exemple/ }).click();
await page.waitForSelector('.react-flow__node', { timeout: 8000 });
await page.getByRole('button', { name: 'Ajuster la vue' }).click().catch(() => {});
await page.waitForTimeout(2600);
await page.screenshot({ path: `${OUT}/pfd-ui-main.png` });

const hasStatusBar = await page.locator('.sb-bar').count();

// Documents tab (now in the left pane)
let docs = 'n/a';
try {
  await page.locator('.lp-tab', { hasText: 'Documents' }).click();
  await page.waitForSelector('.docp-root', { timeout: 4000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/pfd-ui-docs.png` });
  docs = 'OK';
} catch (e) { docs = 'FAIL: ' + (e instanceof Error ? e.message : String(e)); }

// drag test (works in web; native needs dragDropEnabled:false)
let drag = 'n/a';
try {
  await page.locator('.lp-tab', { hasText: 'Bibliothèque' }).click();
  await page.waitForSelector('.pal-tile', { timeout: 3000 });
  const before = await page.locator('.react-flow__node').count();
  await page.locator('.pal-tile').first().dragTo(page.locator('.react-flow__pane'));
  await page.waitForTimeout(500);
  const after = await page.locator('.react-flow__node').count();
  drag = after > before ? `OK (+${after - before})` : `no change (${before})`;
} catch (e) { drag = 'FAIL: ' + (e instanceof Error ? e.message : String(e)); }

console.log('StatusBar present:', hasStatusBar > 0 ? 'yes' : 'NO');
console.log('Documents tab:', docs);
console.log('Palette drag (web):', drag);
console.log('CONSOLE_ERRORS:', errors.length);
for (const e of errors.slice(0, 12)) console.log('  -', e);
await browser.close();
