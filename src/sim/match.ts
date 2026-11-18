/** One run of the game: build phases, waves, chat collection, and win or loss. */
import type { ChatEvent } from '../chat/types';
import { mulberry32, type Rng } from '../genome';
import { BALANCE } from './balance';
import { SpawnCollector, type ChatMode, type WavePlan } from './collector';
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
  private rng: Rng;

  constructor(options: MatchOptions) {
    this.mode = options.mode;
    this.rng = mulberry32(options.seed ?? Date.now());
  }

  handleChat(event: ChatEvent): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
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
    this.lastPlan = this.collector.takeWave(budget, this.mode, this.rng);
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
  }

  placeTower(id: TowerId, col: number, row: number): Tower | null {
    if (this.phase === 'won' || this.phase === 'lost') return null;
    return this.world.placeTower(id, col, row);
  }

  sellTower(tower: Tower): number {
    return this.world.sellTower(tower);
  }
}
