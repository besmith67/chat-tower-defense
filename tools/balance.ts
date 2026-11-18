/**
 * Headless balance check. A bot plays full runs and reports how far it gets.
 * Run with: npx tsx tools/balance.ts [runs] [strategy] [offline|chat]
 * Strategies: smart (covers the path, mixes towers), needles (only needles), lazy (spends half).
 * "chat" plays blended mode with a simulated busy chat drawn from CHAT_POOL. That simulated chat
 * exists only in this tool, to exercise the meaning layer. The game itself never fakes chat.
 */
import { mulberry32 } from '../src/genome/hash';
import { BALANCE } from '../src/sim/balance';
import { COLS, ROWS, TILE } from '../src/sim/map';
import { Match, type Phase } from '../src/sim/match';
import { TOWERS, type TowerId } from '../src/sim/towers';

type Strategy = 'smart' | 'needles' | 'lazy';
const runs = Number(process.argv[2] ?? 20);
const strategy = (process.argv[3] ?? 'smart') as Strategy;
const chatMode = process.argv[4] === 'chat';

/** Words a real chat might spam. Mixed on purpose: beasts, elements, verbs, slang, emotes, junk. */
const CHAT_POOL = (
  'snail rocket ghost zombie dragon tank cheetah wolf fire ice storm lava pog poggers KEKW LUL Sadge ' +
  'catJAM EZ Kappa OMEGALUL monkaS Copium W L gg ratio sus based bruh lmao hahaha NOOOO nooo ' +
  'pizza taco bomb nuke robot ninja goblin troll slime spider bee mountain volcano tornado lightning ' +
  'dig hide sneak heal explode sprint yeet angry sleepy cute evil holy hype boom bonk zoom ' +
  'xqcL asdf hmmm racecar h4x0r 420 69 W W W L KEKW KEKW pog pog'
).split(' ');

function chatter(match: Match, wave: number, seed: number): void {
  const rng = mulberry32(seed * 7919 + wave);
  const messages = 25 + Math.floor(rng() * 30);
  for (let i = 0; i < messages; i++) {
    const word = CHAT_POOL[Math.floor(rng() * CHAT_POOL.length)];
    const user = `viewer${Math.floor(rng() * 400)}`;
    match.handleChat({
      type: 'message',
      message: { id: `${wave}-${i}`, platform: 'local', userId: user, userName: user, text: word, emotes: [], at: i },
    });
  }
}

function coverage(match: Match, col: number, row: number, range: number): number {
  const x = col * TILE + TILE / 2;
  const y = row * TILE + TILE / 2;
  let score = 0;
  for (const path of Object.values(match.world.map.paths)) {
    for (let d = 0; d < path.length; d += 10) {
      const p = path.pointAt(d);
      if (Math.hypot(p.x - x, p.y - y) <= range) score++;
    }
  }
  return score;
}

function build(match: Match, step: number): void {
  const plan: TowerId[] = strategy === 'needles' ? ['needle'] : ['needle', 'hammer', 'needle', 'frost'];
  const reserve = strategy === 'lazy' ? match.world.gold / 2 : 0;
  for (;;) {
    const id = plan[(match.world.towers.length + step) % plan.length];
    const def = TOWERS[id];
    if (match.world.gold - def.cost < reserve || match.world.gold < def.cost) return;
    let best: [number, number, number] | null = null;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (!match.world.canPlace(c, r)) continue;
        const s = coverage(match, c, r, def.range);
        if (!best || s > best[2]) best = [c, r, s];
      }
    }
    if (!best) return;
    match.placeTower(id, best[0], best[1]);
  }
}

const results: { wave: number; lives: number; won: boolean }[] = [];
const leaks = new Map<string, { count: number; lives: number }>();
const livesByWave = new Map<number, number[]>();
for (let i = 0; i < runs; i++) {
  const match = new Match({ mode: chatMode ? 'blended' : 'offline', seed: 1000 + i });
  let lastWave = 0;
  while (match.phase === 'build' || match.phase === 'wave') {
    if (match.phase === 'build') {
      if (match.wave !== lastWave) {
        build(match, match.wave);
        lastWave = match.wave;
      }
      if (chatMode) chatter(match, match.wave, i);
      match.startWave();
    } else {
      match.update(1 / 30);
      for (const e of match.world.drainEvents()) {
        if (e.type !== 'leak') continue;
        const g = e.monster.genome;
        const name = g.source === 'wilds' ? '(wilds)' : `${g.token}${e.monster.order.copies > 1 ? ' titan' : ''}`;
        const entry = leaks.get(name) ?? { count: 0, lives: 0 };
        entry.count++;
        entry.lives += e.monster.livesCost;
        leaks.set(name, entry);
      }
      const phase: Phase = match.phase;
      if (phase !== 'wave') {
        const finished = match.wave - (phase === 'build' ? 1 : 0);
        const arr = livesByWave.get(finished) ?? [];
        arr.push(match.world.lives);
        livesByWave.set(finished, arr);
      }
    }
  }
  results.push({ wave: match.wave, lives: match.world.lives, won: match.phase === 'won' });
}

const wins = results.filter((r) => r.won).length;
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`strategy=${strategy} chat=${chatMode ? 'simulated' : 'off'} runs=${runs} wins=${wins}/${runs}`);
console.log(`avg final wave=${avg(results.map((r) => r.wave))} avg lives left=${avg(results.map((r) => r.lives))}`);
console.log('wave: avg lives after wave (runs reaching it)');
for (let w = 1; w <= BALANCE.totalWaves; w++) {
  const arr = livesByWave.get(w);
  if (arr) console.log(`  ${String(w).padStart(2)}: ${avg(arr).padStart(5)}  (${arr.length})`);
}

const topLeaks = [...leaks.entries()].sort((a, b) => b[1].lives - a[1].lives).slice(0, 12);
if (topLeaks.length) {
  console.log('worst leaks: lives lost (count)');
  for (const [name, l] of topLeaks) console.log(`  ${name.padEnd(18)} ${String(l.lives).padStart(4)} (${l.count})`);
}
