/**
 * Headless balance check. A bot plays full runs and reports how far it gets.
 * Run with: npx tsx tools/balance.ts [runs] [strategy] [offline|chat]
 * Strategies:
 *   smart    reads the queue and the last wave, and buys the towers that counter what is coming
 *   blind    covers the path with a fixed rotation of all five towers, ignoring elements and shapes
 *   needles  only needles
 *   lazy     the blind rotation, but keeps half its gold
 *   worst    like smart, but picks the counter chat's elements resist most (a control for smart)
 * "chat" plays blended mode with a simulated busy chat drawn from CHAT_POOL. That simulated chat
 * exists only in this tool, to exercise the meaning layer. The game itself never fakes chat.
 */
import { mulberry32 } from '../src/genome/hash';
import { BALANCE } from '../src/sim/balance';
import { COLS, ROWS, TILE } from '../src/sim/map';
import { Match, type Phase } from '../src/sim/match';
import { elementMultiplier } from '../src/sim/elements';
import { TOWERS, upgradeCost, type TowerId } from '../src/sim/towers';
import type { Genome } from '../src/genome';

type Strategy = 'smart' | 'worst' | 'blind' | 'needles' | 'lazy';
const runs = Number(process.argv[2] ?? 20);
const strategy = (process.argv[3] ?? 'smart') as Strategy;
const chatMode = process.argv[4] === 'chat';

/** Words a real chat might spam. Mixed on purpose: beasts, elements, verbs, slang, emotes, junk. */
const CHAT_POOL = (
  'snail rocket ghost zombie dragon tank cheetah wolf fire ice storm lava pog poggers KEKW LUL Sadge ' +
  'catJAM EZ Kappa OMEGALUL monkaS Copium W L gg ratio sus based bruh lmao hahaha NOOOO nooo ' +
  'pizza taco bomb nuke robot ninja goblin troll slime spider bee mountain volcano tornado lightning ' +
  'dig hide sneak heal explode sprint yeet angry sleepy cute evil holy hype boom bonk zoom ' +
  'xqcL asdf hmmm racecar h4x0r 420 69 W W W L KEKW KEKW pog pog water ground pillow armor melt'
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

/** What the streamer can see coming: the chat queue. The Wilds are random, so they cannot be read ahead. */
function threats(match: Match): { genome: Genome; weight: number }[] {
  return match.collector.pending.map((p) => ({ genome: p.genome, weight: Math.max(1, p.contributions.length) }));
}

/** Average element multiplier a tower would get against the expected threats. Shape is already covered by the rotation. */
function counterScore(id: TowerId, list: { genome: Genome; weight: number }[]): number {
  const kind = TOWERS[id].kind;
  let total = 0;
  let weight = 0;
  for (const { genome, weight: w } of list) {
    total += w * elementMultiplier(kind, genome.element);
    weight += w;
  }
  return weight ? total / weight : 1;
}

const ROTATION: TowerId[] = (process.env.ROTATION?.split(',') as TowerId[]) ?? ['needle', 'hammer', 'frost', 'flame', 'tesla', 'needle'];

function nextTower(match: Match, step: number): TowerId {
  if (strategy === 'needles') return 'needle';
  const planned = ROTATION[(match.world.towers.length + step) % ROTATION.length];
  if (strategy !== 'smart' && strategy !== 'worst') return planned;
  // Follow the rotation for coverage. Single-target damage slots (Needle, Flame, Tesla) go to whichever
  // of the three best fits the elements chat is queueing, or the worst fit for the control strategy.
  const list = threats(match);
  if (!list.length || !DAMAGE_SLOTS.includes(planned)) return planned;
  const sign = strategy === 'smart' ? 1 : -1;
  return DAMAGE_SLOTS.reduce((a, b) => (sign * counterScore(b, list) > sign * counterScore(a, list) ? b : a));
}

const DAMAGE_SLOTS: TowerId[] = ['needle', 'flame', 'tesla'];

/** After this many towers, gold goes to upgrades (strategies other than needles and lazy). Set TOWER_CAP=14 to test upgrades. */
const TOWER_CAP = Number(process.env.TOWER_CAP ?? 99);

function upgradeOne(match: Match): boolean {
  const options = match.world.towers
    .map((t) => ({ t, cost: upgradeCost(TOWERS[t.def.id], t.level) }))
    .filter((o): o is { t: (typeof match.world.towers)[number]; cost: number } => o.cost !== null && o.cost <= match.world.gold)
    .sort((a, b) => a.t.level - b.t.level || a.cost - b.cost);
  return options.length > 0 && match.upgradeTower(options[0].t);
}

function build(match: Match, step: number): void {
  const reserve = strategy === 'lazy' ? match.world.gold / 2 : 0;
  const upgrades = strategy !== 'needles' && strategy !== 'lazy';
  for (;;) {
    if (upgrades && match.world.towers.length >= TOWER_CAP) {
      if (!upgradeOne(match)) return;
      continue;
    }
    const id = nextTower(match, step);
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
const towerTally: Record<string, number> = {};
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
  for (const t of match.world.towers) towerTally[t.def.id] = (towerTally[t.def.id] ?? 0) + 1;
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
if (process.env.DEBUG_TOWERS) console.log('towers bought:', JSON.stringify(towerTally));
