/**
 * Headless balance check. A bot plays full offline runs and reports how far it gets.
 * Run with: npx tsx tools/balance.ts [runs] [strategy]
 * Strategies: smart (covers the path, mixes towers), needles (only needles), lazy (spends half).
 */
import { BALANCE } from '../src/sim/balance';
import { COLS, ROWS, TILE } from '../src/sim/map';
import { Match } from '../src/sim/match';
import { TOWERS, type TowerId } from '../src/sim/towers';

type Strategy = 'smart' | 'needles' | 'lazy';
const runs = Number(process.argv[2] ?? 20);
const strategy = (process.argv[3] ?? 'smart') as Strategy;

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
const livesByWave = new Map<number, number[]>();
for (let i = 0; i < runs; i++) {
  const match = new Match({ mode: 'offline', seed: 1000 + i });
  let lastWave = 0;
  while (match.phase === 'build' || match.phase === 'wave') {
    if (match.phase === 'build') {
      if (match.wave !== lastWave) {
        build(match, match.wave);
        lastWave = match.wave;
      }
      match.startWave();
    } else {
      match.update(1 / 30);
      if (match.phase === 'build' || match.phase === 'won' || match.phase === 'lost') {
        const arr = livesByWave.get(match.wave - (match.phase === 'build' ? 1 : 0)) ?? [];
        arr.push(match.world.lives);
        livesByWave.set(match.wave - (match.phase === 'build' ? 1 : 0), arr);
      }
    }
  }
  results.push({ wave: match.wave, lives: match.world.lives, won: match.phase === 'won' });
}

const wins = results.filter((r) => r.won).length;
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
console.log(`strategy=${strategy} runs=${runs} wins=${wins}/${runs}`);
console.log(`avg final wave=${avg(results.map((r) => r.wave))} avg lives left=${avg(results.map((r) => r.lives))}`);
console.log('wave: avg lives after wave (runs reaching it)');
for (let w = 1; w <= BALANCE.totalWaves; w++) {
  const arr = livesByWave.get(w);
  if (arr) console.log(`  ${String(w).padStart(2)}: ${avg(arr).padStart(5)}  (${arr.length})`);
}
