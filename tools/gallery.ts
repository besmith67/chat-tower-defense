/**
 * Art review: renders a grid of monsters, large, to a screenshot.
 * Needs `npm run build && npx vite preview --port 4173`. Usage:
 *   npx tsx tools/gallery.ts out.png wolf truck pizza knight eye mountain
 */
import puppeteer from 'puppeteer-core';

const [out = 'gallery.png', ...words] = process.argv.slice(2);
const list = words.length ? words : 'wolf truck pizza knight eye mountain fire love boom pog snail KEKW'.split(' ');
const URL = process.env.GAME_URL ?? 'http://localhost:4173/?mode=offline&autostart=1&debug=1';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => (window as any).__ctd?.scene()?.sys?.isActive?.(), { timeout: 15000 });
await page.evaluate((w) => (window as any).__ctd.scene().debugGallery(w), list);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: out as `${string}.png` });
await browser.close();
console.log(`Saved ${out}`);
