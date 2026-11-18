/**
 * The deterministic combat simulation. Advances with step(dt) and reports what happened as
 * events, which the renderer turns into visuals. Contains no rendering code.
 */
import type { Genome } from '../genome';
import { BALANCE } from './balance';
import type { SpawnOrder } from './collector';
import { elementMultiplier } from './elements';
import { JAM_EVERY, JAM_RANGE, JAM_SECONDS, sabotageTarget } from './sabotage';
import { createMap, getMap, tileKey, COLS, ROWS, TILE, type GameMap, type PortalId } from './map';
import { armorFactor, formMultiplier, TOWERS, towerAtLevel, upgradeCost, type TowerDef, type TowerId } from './towers';

export interface Monster {
  id: number;
  genome: Genome;
  order: SpawnOrder;
  portal: PortalId;
  dist: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  radius: number;
  age: number;
  slowUntil: number;
  slowFactor: number;
  panicUntil: number;
  nextBlinkAt: number;
  copeReadyAt: number;
  shieldUp: boolean;
  /** Set once an undying monster has used its second life. */
  revived: boolean;
  burnUntil: number;
  burnDps: number;
  /** The Flame tower that set it burning, credited if the burn kills it. */
  burnBy: Tower | null;
  nextShoutAt: number;
  nextHopAt: number;
  /** The tower type this saboteur jams, or null. */
  sabotage: TowerId | null;
  nextJamAt: number;
  bounty: number;
  livesCost: number;
  alive: boolean;
}

export interface Tower {
  id: number;
  def: TowerDef;
  col: number;
  row: number;
  x: number;
  y: number;
  cooldownLeft: number;
  stunnedUntil: number;
  /** Kills per species key. Towers adapt to what they kill often. */
  kills: Map<string, number>;
  spent: number;
  /** 1 to MAX_LEVEL. def holds the stats for this level. */
  level: number;
}

export type Effectiveness = 'strong' | 'weak' | 'normal';

export type SimEvent =
  | { type: 'spawn'; monster: Monster }
  | { type: 'shot'; tower: Tower; target: Monster }
  | { type: 'chain'; tower: Tower; from: Monster; to: Monster }
  | { type: 'pulse'; tower: Tower }
  | { type: 'hit'; monster: Monster; amount: number; effect: Effectiveness }
  | { type: 'reflect'; monster: Monster }
  | { type: 'shield'; monster: Monster }
  | { type: 'heal'; monster: Monster }
  | { type: 'revive'; monster: Monster }
  | { type: 'dodge'; monster: Monster }
  | { type: 'snack'; monster: Monster; healed: number }
  | { type: 'shout'; monster: Monster; towers: Tower[] }
  | { type: 'viral'; monster: Monster }
  | { type: 'hop'; monster: Monster }
  | { type: 'jam'; monster: Monster; towers: Tower[] }
  | { type: 'steal'; monster: Monster; amount: number }
  | { type: 'blink'; monster: Monster }
  | { type: 'stun'; tower: Tower }
  | { type: 'death'; monster: Monster; killer: Tower | null }
  | { type: 'leak'; monster: Monster };

interface QueuedSpawn {
  order: SpawnOrder;
  at: number;
}

export class World {
  readonly map: GameMap;
  monsters: Monster[] = [];
  towers: Tower[] = [];
  gold: number;
  lives: number;
  time = 0;
  wave = 1;
  private queue: QueuedSpawn[] = [];
  private events: SimEvent[] = [];
  /** Leaks per species this run, for evolution. */
  readonly leaksBySpecies = new Map<string, number>();
  private nextId = 1;

  constructor(gold: number = BALANCE.startingGold, lives: number = BALANCE.startingLives, mapId?: string) {
    this.gold = gold;
    this.lives = lives;
    this.map = createMap(getMap(mapId));
  }

  /** True when the current wave has nothing left to spawn and nothing alive. */
  get waveDone(): boolean {
    return this.queue.length === 0 && this.monsters.length === 0;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  queueWave(orders: SpawnOrder[], wave: number): void {
    this.wave = wave;
    let t = this.time + 0.5;
    for (const order of orders) {
      this.queue.push({ order, at: t });
      t += BALANCE.spawnInterval * (order.genome.swarm > 1 ? 0.35 : 1);
    }
  }

  // ---- Towers ----

  canPlace(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    if (this.map.pathTiles.has(tileKey(col, row))) return false;
    return !this.towers.some((t) => t.col === col && t.row === row);
  }

  placeTower(id: TowerId, col: number, row: number): Tower | null {
    const def = TOWERS[id];
    if (!this.canPlace(col, row) || this.gold < def.cost) return null;
    this.gold -= def.cost;
    const tower: Tower = {
      id: this.nextId++,
      def,
      col,
      row,
      x: col * TILE + TILE / 2,
      y: row * TILE + TILE / 2,
      cooldownLeft: 0,
      stunnedUntil: 0,
      kills: new Map(),
      spent: def.cost,
      level: 1,
    };
    this.towers.push(tower);
    return tower;
  }

  towerAt(col: number, row: number): Tower | undefined {
    return this.towers.find((t) => t.col === col && t.row === row);
  }

  /** Raises a tower one level. Returns false at max level or without enough gold. */
  upgradeTower(tower: Tower): boolean {
    const base = TOWERS[tower.def.id];
    const cost = upgradeCost(base, tower.level);
    if (cost === null || this.gold < cost) return false;
    this.gold -= cost;
    tower.spent += cost;
    tower.level++;
    tower.def = towerAtLevel(base, tower.level);
    return true;
  }

  sellTower(tower: Tower): number {
    const refund = Math.floor(tower.spent * BALANCE.sellRefund);
    this.towers = this.towers.filter((t) => t !== tower);
    this.gold += refund;
    return refund;
  }

  // ---- Simulation ----

  step(dt: number): void {
    this.time += dt;

    while (this.queue.length && this.queue[0].at <= this.time) {
      const { order } = this.queue.shift()!;
      this.spawn(order, order.genome.source === 'wilds' ? 'wilds' : 'chat', 0);
    }

    this.moveMonsters(dt);
    this.runTowers(dt);
    this.monsters = this.monsters.filter((m) => m.alive);
  }

  spawn(order: SpawnOrder, portal: PortalId, dist: number): Monster {
    const { genome } = order;
    const w = genome.weights;
    const power = order.power * BALANCE.wavePower(this.wave);
    const family = genome.family;
    const maxHp = Math.max(4, power * BALANCE.hpPerPower * (0.45 + 1.65 * w.hp)) * (family === 'place' ? 1.15 : 1) * this.map.def.toughness;
    const cyber = genome.quirks.includes('cyber') ? 0.15 : 0;
    const plating = family === 'construct' ? 0.08 : 0;
    const pos = this.map.paths[portal].pointAt(dist);
    const monster: Monster = {
      id: this.nextId++,
      genome,
      order,
      portal,
      dist,
      x: pos.x,
      y: pos.y,
      hp: maxHp,
      maxHp,
      armor: Math.min(BALANCE.maxArmor, (w.armor * 0.8 + cyber + plating) * (family === 'elemental' ? 0.5 : 1)),
      speed: ((BALANCE.baseSpeed + BALANCE.speedRange * w.speed) / Math.pow(order.scale, BALANCE.titanSlowExponent)) * (family === 'place' ? 0.9 : 1),
      radius: genome.look.radius * order.scale,
      age: 0,
      slowUntil: 0,
      slowFactor: 0,
      panicUntil: 0,
      nextBlinkAt: this.time + 3 + (genome.look.phase % 1.5),
      copeReadyAt: 0,
      shieldUp: genome.quirks.includes('shielded'),
      revived: false,
      burnUntil: 0,
      burnDps: 0,
      burnBy: null,
      nextShoutAt: this.time + 2 + (genome.look.phase % 2),
      nextHopAt: this.time + 2 + (genome.look.phase % 1),
      sabotage: sabotageTarget(genome),
      nextJamAt: 0,
      bounty: Math.max(1, Math.round(order.cost * BALANCE.bountyPerThreat * (genome.source === 'chat' ? BALANCE.chatBountyMultiplier : 1))),
      livesCost: Math.min(5, Math.max(1, Math.round(order.cost / BALANCE.unitCost))),
      alive: true,
    };
    this.monsters.push(monster);
    this.events.push({ type: 'spawn', monster });
    return monster;
  }

  /** Burrowers spend 1.2 of every 5 seconds underground, where nothing can hit them. */
  isBurrowed(m: Monster): boolean {
    return m.genome.quirks.includes('burrow') && (m.age + m.genome.look.phase) % 5 > 3.8;
  }

  /** Heralds near this monster, other than itself. */
  private heraldsNear(m: Monster): Monster[] {
    return this.monsters.filter(
      (h) => h !== m && h.alive && h.genome.quirks.includes('herald') && h.genome.meaning && Math.hypot(h.x - m.x, h.y - m.y) < 90,
    );
  }

  private moveMonsters(dt: number): void {
    const hypeSources = this.monsters.filter((m) => m.genome.quirks.includes('hype'));
    const healers = this.monsters.filter((m) => m.alive && m.genome.quirks.includes('healer'));
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.age += dt;
      // Percentage healing would make huge bodies unkillable, so titans and bosses heal slower.
      const healScale = 1 / (m.order.scale * m.order.scale);
      if (m.genome.quirks.includes('regen')) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BALANCE.regenPerSecond * healScale * dt);
      if (this.time < m.burnUntil && m.burnBy) {
        m.hp -= m.burnDps * elementMultiplier('fire', m.genome.element) * dt;
        if (m.hp <= 0) {
          this.finish(m, m.burnBy);
          if (!m.alive) continue;
        }
      }
      let speed = m.speed * this.speedFactor(m);
      if (hypeSources.some((h) => h !== m && Math.hypot(h.x - m.x, h.y - m.y) < 70)) speed *= 1.25;
      for (const h of this.heraldsNear(m)) {
        const a = h.genome.meaning!.axes;
        speed *= 1 + 0.06 * a.speed;
        if (a.life > 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.01 * a.life * healScale * dt);
      }
      if (healers.some((h) => h !== m && Math.hypot(h.x - m.x, h.y - m.y) < 70)) {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.03 * healScale * dt);
      }
      m.dist += speed * dt;

      if (m.genome.quirks.includes('blink') && this.time >= m.nextBlinkAt) {
        m.dist += 70;
        m.nextBlinkAt = this.time + 4;
        this.events.push({ type: 'blink', monster: m });
      }

      if (m.genome.quirks.includes('hop') && this.time >= m.nextHopAt) {
        m.dist += 45;
        m.nextHopAt = this.time + 3;
        this.events.push({ type: 'hop', monster: m });
      }

      if (m.sabotage && this.time >= m.nextJamAt) {
        const jammed = this.towers.filter((t) => t.def.id === m.sabotage && Math.hypot(t.x - m.x, t.y - m.y) < JAM_RANGE);
        if (jammed.length) {
          for (const t of jammed) t.stunnedUntil = Math.max(t.stunnedUntil, this.time + JAM_SECONDS);
          m.nextJamAt = this.time + JAM_EVERY;
          this.events.push({ type: 'jam', monster: m, towers: jammed });
        }
      }

      if (m.genome.family === 'sound' && this.time >= m.nextShoutAt) {
        m.nextShoutAt = this.time + 5;
        const stunned = this.towers.filter((t) => Math.hypot(t.x - m.x, t.y - m.y) < 75);
        for (const t of stunned) t.stunnedUntil = Math.max(t.stunnedUntil, this.time + 0.5);
        this.events.push({ type: 'shout', monster: m, towers: stunned });
      }

      const path = this.map.paths[m.portal];
      if (m.dist >= path.length) {
        m.alive = false;
        this.lives = Math.max(0, this.lives - m.livesCost);
        this.leaksBySpecies.set(m.genome.key, (this.leaksBySpecies.get(m.genome.key) ?? 0) + 1);
        this.events.push({ type: 'leak', monster: m });
        if (m.genome.quirks.includes('thief')) {
          const amount = Math.min(this.gold, 4 + 6 * m.livesCost);
          this.gold -= amount;
          if (amount > 0) this.events.push({ type: 'steal', monster: m, amount });
        }
        continue;
      }
      const p = path.pointAt(m.dist);
      m.x = p.x;
      m.y = p.y;
    }
  }

  private speedFactor(m: Monster): number {
    const q = m.genome.quirks;
    const phase = m.genome.look.phase;
    let f = 1;
    if (this.time < m.slowUntil) f *= 1 - m.slowFactor;
    if (q.includes('enraged')) f *= 1 + 0.8 * (1 - m.hp / m.maxHp);
    if (q.includes('charge') && (m.age + phase) % 3 < 0.6) f *= 2.2;
    if (q.includes('confused')) f *= 0.9 + 0.5 * Math.sin(m.age * 2.3 + phase);
    if (q.includes('drowsy')) f *= 0.8;
    if (q.includes('panic') && this.time < m.panicUntil) f *= 1.9;
    if (q.includes('rhythm')) f *= 0.2 + 2 * Math.max(0, Math.sin((m.age + phase) * Math.PI * 2));
    return f;
  }

  private runTowers(dt: number): void {
    const gloomSources = this.monsters.filter((m) => m.alive && m.genome.quirks.includes('gloom'));
    for (const tower of this.towers) {
      if (this.time < tower.stunnedUntil) continue;
      const gloomed = gloomSources.some((g) => Math.hypot(g.x - tower.x, g.y - tower.y) < 90);
      tower.cooldownLeft -= dt * (gloomed ? 0.65 : 1);
      if (tower.cooldownLeft > 0) continue;

      if (tower.def.kind === 'cold') {
        const targets = this.monsters.filter((m) => m.alive && this.inRange(tower, m));
        if (targets.length === 0) continue;
        tower.cooldownLeft = tower.def.cooldown;
        this.events.push({ type: 'pulse', tower });
        for (const m of targets) {
          // Frost monsters shrug off half the chill. Floating body parts ignore it.
          m.slowFactor = m.genome.family === 'body' ? 0 : (tower.def.slow ?? 0) * (m.genome.element === 'frost' ? 0.5 : 1);
          m.slowUntil = this.time + (tower.def.slowSeconds ?? 1);
          this.damage(tower, m);
        }
        continue;
      }

      const target = this.pickTarget(tower);
      if (!target) continue;
      tower.cooldownLeft = tower.def.cooldown;
      this.events.push({ type: 'shot', tower, target });
      if (tower.def.splash) {
        const splash = tower.def.splash;
        for (const m of this.monsters.filter((m) => m.alive && Math.hypot(m.x - target.x, m.y - target.y) <= splash + m.radius)) {
          this.damage(tower, m);
        }
      } else {
        this.damage(tower, target);
      }
      if (tower.def.chains) this.chain(tower, target);
    }
  }

  /** Lightning jumps from the target to the nearest monsters it has not hit yet. */
  private chain(tower: Tower, first: Monster): void {
    const hit = new Set([first]);
    let from = first;
    let scale = 1;
    for (let i = 0; i < (tower.def.chains ?? 0); i++) {
      scale *= tower.def.chainFalloff ?? 1;
      let next: Monster | null = null;
      let best = tower.def.chainRange ?? 0;
      for (const m of this.monsters) {
        if (!m.alive || hit.has(m)) continue;
        const d = Math.hypot(m.x - from.x, m.y - from.y);
        if (d <= best) {
          best = d;
          next = m;
        }
      }
      if (!next) return;
      hit.add(next);
      this.events.push({ type: 'chain', tower, from, to: next });
      this.damage(tower, next, scale);
      from = next;
    }
  }

  private inRange(tower: Tower, m: Monster): boolean {
    if (this.isBurrowed(m)) return false;
    const q = m.genome.quirks;
    const range = tower.def.range * (q.includes('drowsy') ? 0.65 : 1) * (q.includes('stealth') ? BALANCE.stealthRange : 1);
    return Math.hypot(m.x - tower.x, m.y - tower.y) <= range + m.radius * 0.5;
  }

  /** Mocking monsters taunt: towers must shoot them first. Otherwise target whoever is furthest along. */
  private pickTarget(tower: Tower): Monster | null {
    const inRange = this.monsters.filter((m) => m.alive && this.inRange(tower, m));
    if (inRange.length === 0) return null;
    const mocking = inRange.filter((m) => m.genome.quirks.includes('mocking'));
    const pool = mocking.length ? mocking : inRange;
    return pool.reduce((best, m) => (m.dist > best.dist ? m : best));
  }

  /** Damage multiplier a tower has earned against this species from repeated kills. */
  adaptation(tower: Tower, genome: Genome): number {
    const kills = tower.kills.get(genome.key) ?? 0;
    return 1 + Math.min(BALANCE.adaptationCap, kills * BALANCE.adaptationPerKill);
  }

  private damage(tower: Tower, m: Monster, scale = 1): void {
    if (!m.alive || this.isBurrowed(m)) return;
    const q = m.genome.quirks;
    if (m.shieldUp) {
      m.shieldUp = false;
      this.events.push({ type: 'shield', monster: m });
      return;
    }
    if (q.includes('mirror') && this.chance(m, 0.25)) {
      this.events.push({ type: 'reflect', monster: m });
      return;
    }

    const family = m.genome.family;
    const kind = tower.def.kind;
    if (family === 'person' && (kind === 'pierce' || kind === 'fire') && this.chance(m, 0.15)) {
      this.events.push({ type: 'dodge', monster: m });
      return;
    }
    let element = elementMultiplier(kind, m.genome.element);
    if (family === 'elemental') element *= element;
    const physical = family === 'abstract' && (kind === 'pierce' || kind === 'blunt') ? 0.8 : 1;
    const matchup = formMultiplier(kind, m.genome.formClass) * element * physical;
    const armor = m.armor * armorFactor(tower.def.kind);
    // Heralds that mean hard or huge toughen the monsters around them.
    let guard = 1;
    for (const h of this.heraldsNear(m)) {
      const a = h.genome.meaning!.axes;
      guard *= 1 - 0.06 * Math.max(0, a.hardness, a.mass);
    }
    const amount = tower.def.damage * scale * matchup * guard * (1 - armor) * this.adaptation(tower, m.genome);
    m.hp -= amount;
    const effect: Effectiveness = matchup > 1.01 ? 'strong' : matchup < 0.99 ? 'weak' : 'normal';
    if (tower.def.burnDps) {
      m.burnUntil = this.time + (tower.def.burnSeconds ?? 1);
      m.burnDps = tower.def.burnDps * this.adaptation(tower, m.genome);
      m.burnBy = tower;
    }
    this.events.push({ type: 'hit', monster: m, amount, effect });

    if (q.includes('panic')) m.panicUntil = this.time + 0.6;
    if (q.includes('cope') && m.hp > 0 && amount > m.maxHp * 0.15 && this.time >= m.copeReadyAt) {
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.2);
      m.copeReadyAt = this.time + 3;
      this.events.push({ type: 'heal', monster: m });
    }

    if (m.hp <= 0) this.finish(m, tower);
  }

  /** Called when health hits zero. Undying monsters get back up once; everything else dies. */
  private finish(m: Monster, killer: Tower): void {
    if (m.genome.quirks.includes('undying') && !m.revived) {
      m.revived = true;
      m.hp = m.maxHp * 0.35;
      m.burnUntil = 0;
      this.events.push({ type: 'revive', monster: m });
      return;
    }
    this.kill(m, killer);
  }

  private kill(m: Monster, killer: Tower): void {
    m.alive = false;
    this.gold += m.bounty;
    killer.kills.set(m.genome.key, (killer.kills.get(m.genome.key) ?? 0) + 1);
    this.events.push({ type: 'death', monster: m, killer });
    const q = m.genome.quirks;

    if (q.includes('stunburst')) {
      const nearest = this.towers
        .filter((t) => Math.hypot(t.x - m.x, t.y - m.y) < 150)
        .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
      if (nearest) {
        nearest.stunnedUntil = this.time + 1.2;
        this.events.push({ type: 'stun', tower: nearest });
      }
    }

    if (m.genome.family === 'food') {
      let healed = 0;
      for (const other of this.monsters) {
        if (!other.alive || other === m || Math.hypot(other.x - m.x, other.y - m.y) > 80) continue;
        other.hp = Math.min(other.maxHp, other.hp + other.maxHp * 0.15);
        healed++;
      }
      this.events.push({ type: 'snack', monster: m, healed });
    }

    if (m.genome.family === 'meme' && m.order.cost > 0 && this.chance(m, 0.3)) {
      const copy: Genome = { ...m.genome, family: null, look: { ...m.genome.look, radius: m.genome.look.radius * 0.7 } };
      const child = this.spawn({ ...m.order, genome: copy, power: m.order.power * 0.3, cost: 0 }, m.portal, Math.max(0, m.dist - 10));
      child.bounty = 1;
      this.events.push({ type: 'viral', monster: child });
    }

    if (q.includes('splitter')) {
      const mini: Genome = {
        ...m.genome,
        quirks: m.genome.quirks.filter((x) => x !== 'splitter'),
        look: { ...m.genome.look, radius: m.genome.look.radius * 0.6 },
      };
      for (let i = 0; i < 3; i++) {
        const child = this.spawn(
          { ...m.order, genome: mini, power: m.order.power * 0.25, cost: 0, scale: m.order.scale },
          m.portal,
          Math.max(0, m.dist - i * 12),
        );
        child.bounty = 1;
      }
    }
  }

  /** Deterministic per-hit coin flip, so replays and tests are stable. */
  private hitCounter = 0;
  private chance(m: Monster, p: number): boolean {
    this.hitCounter++;
    const x = Math.sin(m.id * 12.9898 + this.hitCounter * 78.233) * 43758.5453;
    return x - Math.floor(x) < p;
  }
}
