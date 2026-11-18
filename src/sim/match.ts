/** One run of the game: build phases, waves, chat collection, and win or loss. */
import type { ChatEvent } from '../chat/types';
import { mulberry32, type Rng } from '../genome';
import { BALANCE } from './balance';
import { Bestiary, type Discovery } from './bestiary';
import { BOSS_SHARE, BossVote, isBossWave, pickCandidates, type BossCandidate } from './boss';
import { SpawnCollector, type ChatMode, type SpawnOrder, type WavePlan } from './collector';
import type { TowerId } from './towers';
import { World, type Tower } from './world';

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export interface MatchOptions {
  mode: ChatMode;
  seed?: number;
  bestiary?: Bestiary;
}

/** Leaks it takes for a species to evolve into its Prime form for the rest of the run. */
export const EVOLVE_AT = 3;

export class Match {
  readonly world = new World();
  readonly collector = new SpawnCollector();
  readonly mode: ChatMode;
  phase: Phase = 'build';
  /** The wave being fought, or the next wave during a build phase. */
  wave = 1;
  timer: number = BALANCE.firstBuildSeconds;
  lastPlan: WavePlan | null = null;
  /** Running totals for the chat vs Wilds split shown on the HUD. */
  totals = { chat: 0, wilds: 0 };
  /** Open during the build phase before a boss wave. */
  bossVote: BossVote | null = null;
  /** The boss of the current or most recent boss wave. */
  boss: BossCandidate | null = null;
  /** Every chat species spawned this run, with how many copies chat sent. Boss candidates come from here. */
  private history = new Map<string, BossCandidate>();
  readonly bestiary: Bestiary;
  /** New species discovered in the last wave, for the HUD to announce. */
  discoveries: Discovery[] = [];
  /** Species that evolved this run, by key. */
  readonly evolved = new Set<string>();
  /** Species that evolved when the last wave started, for the HUD to announce. */
  evolutions: string[] = [];
  private leaksRecorded = new Map<string, number>();
  private rng: Rng;

  constructor(options: MatchOptions) {
    this.mode = options.mode;
    this.rng = mulberry32(options.seed ?? Date.now());
    this.bestiary = options.bestiary ?? new Bestiary();
  }

  handleChat(event: ChatEvent): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    if (event.type === 'message' && this.bossVote && this.phase === 'build' && this.bossVote.handle(event.message)) return;
    this.collector.handle(event);
  }

  update(dt: number): void {
    if (this.phase === 'build') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.phase !== 'wave') return;

    this.world.step(dt);
    if (this.world.lives <= 0) {
      this.phase = 'lost';
      return;
    }
    if (this.world.waveDone) this.endWave();
  }

  startWave(): void {
    if (this.phase !== 'build') return;
    const budget = BALANCE.waveBudget(this.wave);
    const boss = this.bossVote ? this.bossVote.winner(this.rng) : null;
    this.bossVote = null;
    const bossBudget = boss ? budget * BOSS_SHARE : 0;
    this.lastPlan = this.collector.takeWave(budget - bossBudget, this.mode, this.rng);
    this.evolve(this.lastPlan.orders);
    this.recordHistory(this.lastPlan.orders);
    this.discoveries = this.bestiary.record(this.lastPlan.orders, new Date().toISOString().slice(0, 10));
    if (boss) {
      this.boss = boss;
      // The boss walks in last, behind its wave.
      const order: SpawnOrder = {
        genome: boss.genome,
        // One huge, slow body, with the same concentration discount merged titans get.
        power: Math.pow(bossBudget / BALANCE.unitCost, BALANCE.mergeExponent),
        scale: BALANCE.maxTitanScale,
        cost: bossBudget,
        copies: Math.max(1, boss.copies),
        sender: boss.sentBy,
        boss: true,
      };
      this.lastPlan.orders.push(order);
      if (boss.genome.source === 'chat') this.lastPlan.chatThreat += bossBudget;
      else this.lastPlan.wildThreat += bossBudget;
    }
    this.totals.chat += this.lastPlan.chatThreat;
    this.totals.wilds += this.lastPlan.wildThreat;
    this.world.queueWave(this.lastPlan.orders, this.wave);
    this.phase = 'wave';
    // A wave with nothing in it (chat-only mode, silent chat) ends immediately.
    if (this.world.waveDone) this.endWave();
  }

  /** Species that leaked often this run come back as their Prime form: tougher, and an elite. */
  private evolve(orders: SpawnOrder[]): void {
    this.evolutions = [];
    for (const [key, leaks] of this.world.leaksBySpecies) {
      if (leaks >= EVOLVE_AT && !this.evolved.has(key)) {
        this.evolved.add(key);
        const sample = orders.find((o) => o.genome.key === key);
        if (sample) this.evolutions.push(sample.genome.token);
      }
    }
    for (const o of orders) {
      if (!this.evolved.has(o.genome.key) || o.genome.source !== 'chat') continue;
      const name = o.genome.token.endsWith(' Prime') ? o.genome.token : `${o.genome.token} Prime`;
      o.genome = { ...o.genome, token: name, rarity: 'elite', look: { ...o.genome.look, radius: o.genome.look.radius * 1.12 } };
      o.power *= 1.25;
    }
  }

  private endWave(): void {
    for (const [key, leaks] of this.world.leaksBySpecies) {
      const before = this.leaksRecorded.get(key) ?? 0;
      for (let i = before; i < leaks; i++) this.bestiary.leak(key);
      this.leaksRecorded.set(key, leaks);
    }
    const spent = (this.lastPlan?.chatThreat ?? 0) + (this.lastPlan?.wildThreat ?? 0);
    this.world.gold += Math.round(spent * BALANCE.waveClearBonus);
    if (this.wave >= BALANCE.totalWaves) {
      this.phase = 'won';
      return;
    }
    this.wave++;
    this.phase = 'build';
    this.timer = BALANCE.buildSeconds;
    if (isBossWave(this.wave)) this.bossVote = new BossVote(pickCandidates(this.history.values(), this.rng));
  }

  private recordHistory(orders: SpawnOrder[]): void {
    const seen = new Set<string>();
    for (const o of orders) {
      if (o.genome.source !== 'chat' || o.cost === 0 || seen.has(o.genome.key)) continue;
      seen.add(o.genome.key);
      const entry = this.history.get(o.genome.key);
      if (entry) entry.copies += o.copies;
      else this.history.set(o.genome.key, { genome: o.genome, sentBy: o.sender, copies: o.copies, flagged: this.collector.isBossPick(o.genome) });
    }
  }

  placeTower(id: TowerId, col: number, row: number): Tower | null {
    if (this.phase === 'won' || this.phase === 'lost') return null;
    return this.world.placeTower(id, col, row);
  }

  upgradeTower(tower: Tower): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    return this.world.upgradeTower(tower);
  }

  sellTower(tower: Tower): number {
    return this.world.sellTower(tower);
  }
}
