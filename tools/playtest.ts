/**
 * Scripted visual playtest. Starts the built game in headless Chrome, places towers, sends test
 * chat, and saves screenshots. Requires `npm run build` and a preview server:
 *   npx vite preview --port 4173 &
 *   npx tsx tools/playtest.ts [outDir]
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.GAME_URL ?? 'http://localhost:4173/?mode=blended&autostart=1&debug=1&names=1&channel=xqc';
const out = process.argv[2] ?? 'playtest-shots';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const problems: string[] = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warn') problems.push(`${m.type()}: ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => (window as any).__ctd?.scene()?.sys?.isActive?.(), { timeout: 15000 });
// Give the emote services a moment to answer so third-party emotes get recognized.
await sleep(4000);
await page.screenshot({ path: `${out}/01-start.png` });

// Build a defense and have "chat" send a spread of words that exercise different genes.
// Set WORDS="ghost dragon tree" to send your own list instead.
if (process.env.WORDS) await page.evaluate((w) => ((window as any).__words = w.split(' ')), process.env.WORDS);
await page.evaluate(() => {
  const d = (window as any).__ctd;
  const scene = d.scene();
  scene.registry.get('match').world.gold = 2000;
  const towers: [string, number, number][] = [
    ['needle', 3, 4], ['hammer', 5, 6], ['needle', 8, 4], ['frost', 10, 5], ['hammer', 14, 4],
    ['tesla', 16, 7], ['flame', 14, 10], ['hammer', 19, 10], ['frost', 21, 8], ['tesla', 19, 5], ['flame', 7, 8],
  ];
  for (const [id, c, r] of towers) scene.debugPlace(id, c, r);
  const custom = (window as any).__words as string[] | undefined;
  const words = custom ?? [
    'snail', 'KEKW', 'NOOOOO', 'racecar', 'rocket', 'hahahaha', 'ghost', 'dragon', 'Copium', 'sNaIl',
    'h4x0r', 'zzzzz', 'pizza', 'what?', 'sleep...', 'go!!!', 'EZ', 'LUL', 'tornado', 'wolves',
    'zombie', 'tree', 'quixotic', 'sus', 'lava', 'Sadge', 'catJAM', 'OMEGALUL',
  ];
  words.forEach((w, i) => d.say(w, `viewer${i % 14}`));
  if (!custom) for (let i = 0; i < 6; i++) d.say('KEKW', `spammer${i}`);
});
await sleep(900);
await page.screenshot({ path: `${out}/02-chat-queued.png` });

await page.evaluate(() => (window as any).__ctd.scene().registry.get('match').startWave());
await sleep(3500);
await page.screenshot({ path: `${out}/03-wave.png` });

// Hover a monster still alive to exercise the inspect panel.
const hover = await page.evaluate(() => {
  const m = (window as any).__ctd.scene().registry.get('match');
  const target =
    m.world.monsters.find((x: any) => x.genome.meaning && x.genome.element) ??
    m.world.monsters.find((x: any) => x.genome.source === 'chat') ??
    m.world.monsters[0];
  return target ? { x: target.x, y: target.y + 48 } : null;
});
if (hover) {
  await page.mouse.move(hover.x, hover.y);
  await sleep(300);
  await page.screenshot({ path: `${out}/06-inspect.png` });
}

for (const [i, ms] of [[4, 3000], [5, 4000]] as const) {
  await sleep(ms);
  await page.screenshot({ path: `${out}/0${i}-wave.png` });
}

const state = await page.evaluate(() => {
  const d = (window as any).__ctd;
  const m = d.scene().registry.get('match');
  const hub = d.game.registry.get('hub');
  return {
    phase: m.phase, wave: m.wave, lives: m.world.lives, gold: m.world.gold, monsters: m.world.monsters.length, totals: m.totals,
    emotes: hub.emotes?.size, channelEmotes: hub.emotes?.channelCount, textures: Object.keys(d.game.textures.list).filter((k: string) => k.startsWith('emote:')),
  };
});
console.log('state', JSON.stringify(state));
console.log(problems.length ? problems.join('\n') : 'no console errors');
await browser.close();
