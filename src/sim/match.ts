/** One run of the game: build phases, waves, chat collection, and win or loss. */
import type { ChatEvent } from '../chat/types';
import { mulberry32, type Rng } from '../genome';
import { BALANCE } from './balance';
import { BOSS_SHARE, BossVote, isBossWave, pickCandidates, type BossCandidate } from './boss';
import { SpawnCollector, type ChatMode, type SpawnOrder, type WavePlan } from './collector';
import type { TowerId } from './towers';
import { World, type Tower } from './world';

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export interface MatchOptions {
  mode: ChatMode;
  seed?: number;
}

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
  private rng: Rng;

  constructor(options: MatchOptions) {
    this.mode = options.mode;
    this.rng = mulberry32(options.seed ?? Date.now());
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
    this.recordHistory(this.lastPlan.orders);
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

  private endWave(): void {
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

  sellTower(tower: Tower): number {
    return this.world.sellTower(tower);
  }
}
