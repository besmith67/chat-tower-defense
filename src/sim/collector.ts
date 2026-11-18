/**
 * Collects chat during a spawn window and turns it into a wave plan.
 * Enforces the per-viewer cap, merges duplicate species, honors moderation, and spends the
 * wave's threat budget. In blended and offline modes the Wilds fill the unspent budget.
 */
import { CURATED_EMOTES } from '../genome/curated';
import { isBlocked, makeGenome, makeWildGenome, readEmoji, type Genome, type Rng } from '../genome';
import { groupLinked, resolveCrowd, resolvePatterns, type CrowdEvent } from './crowd';
import { applyStudio, type StudioConfig } from './studio';
import type { ChatEmote, ChatEvent, ChatMessage } from '../chat/types';
import { BALANCE } from './balance';

export type ChatMode = 'offline' | 'blended' | 'chat-only';

export interface Contribution {
  messageId: string;
  userId: string;
  userName: string;
}

export interface PendingSpecies {
  genome: Genome;
  /** The token as chat typed it, so the genome can be rebuilt when an emote's image is analyzed. */
  text: string;
  overlay?: ChatEmote | null;
  contributions: Contribution[];
  firstAt: number;
}

export interface SpawnOrder {
  genome: Genome;
  /** Strength in units of one ordinary monster at this wave. */
  power: number;
  /** Visual size multiplier for merged titans. */
  scale: number;
  /** Threat points this monster consumed from the budget. */
  cost: number;
  /** How many copies of the token chat sent for this monster. */
  copies: number;
  /** The boss of a boss wave. */
  boss?: boolean;
  /** Who sent it. Null for the Wilds. */
  sender: string | null;
}

export interface WavePlan {
  orders: SpawnOrder[];
  budget: number;
  chatThreat: number;
  wildThreat: number;
  /** Fusions and clashes resolved when the wave started. */
  crowd: CrowdEvent[];
}

export class SpawnCollector {
  private species = new Map<string, PendingSpecies>();
  private perUser = new Map<string, number>();
  private showNames = true;

  constructor(private perViewerCap: number = BALANCE.perViewerCap) {}

  setShowNames(show: boolean): void {
    this.showNames = show;
  }

  private studio: StudioConfig = {};

  /** The streamer's Emote Studio choices: renames, disabled emotes, signature abilities. */
  setStudio(config: StudioConfig): void {
    this.studio = config;
  }

  /** Marked as a boss candidate in the Emote Studio. */
  isBossPick(genome: Genome): boolean {
    return !!(genome.emote && this.studio[genome.emote.id]?.boss);
  }

  /** Pending species in the order they will be spent: most copies first, then earliest. */
  get pending(): PendingSpecies[] {
    return [...this.species.values()].sort((a, b) => b.contributions.length - a.contributions.length || a.firstAt - b.firstAt);
  }

  /** Keys of the pending species that fit in a wave with this budget. Used by the HUD preview. */
  preview(budget: number): Set<string> {
    const fits = new Set<string>();
    let remaining = budget;
    for (const p of this.pending) {
      const cost = speciesCost(p);
      if (cost <= remaining || fits.size === 0) {
        fits.add(p.genome.key);
        remaining -= Math.min(cost, remaining);
      }
      if (remaining < BALANCE.unitCost * 0.5) break;
    }
    return fits;
  }

  handle(event: ChatEvent): void {
    if (event.type === 'message') this.addMessage(event.message);
    else if (event.type === 'delete') this.removeWhere((c) => c.messageId === event.messageId);
    else if (event.type === 'purge') this.removeWhere((c) => event.userId === null || c.userId === event.userId);
  }

  /** Returns how many monsters the message added. */
  addMessage(message: ChatMessage): number {
    const tokens = extractTokens(message);
    let added = 0;
    for (const token of tokens) {
      const used = this.perUser.get(message.userId) ?? 0;
      if (used >= this.perViewerCap) break;
      const made = makeGenome(token.text, { source: 'chat', emote: token.emote, overlay: token.overlay ?? null });
      const genome = made && applyStudio(made, this.studio);
      if (!genome) continue;

      const userName = this.showNames && !isBlocked(message.userName) ? message.userName : 'chat';
      const contribution: Contribution = { messageId: message.id, userId: message.userId, userName };
      const existing = this.species.get(genome.key);
      if (existing) existing.contributions.push(contribution);
      else {
        this.species.set(genome.key, { genome, text: token.text, overlay: token.overlay ?? null, contributions: [contribution], firstAt: message.at });
        this.trimBacklog();
      }
      this.perUser.set(message.userId, used + 1);
      added++;
    }
    return added;
  }

  /**
   * Builds the wave. Species that do not fit the budget carry over to the next wave, so a viewer's
   * word is delayed rather than lost. Per-viewer caps reset for the new window.
   */
  /**
   * Rebuilds pending emote species, picking up image analysis that finished after chat first sent
   * them. The species key never changes, only its look and stats.
   */
  refreshEmotes(): void {
    for (const pending of this.species.values()) {
      if (!pending.genome.emote && !pending.overlay) continue;
      const made = makeGenome(pending.text, { source: 'chat', emote: pending.genome.emote, overlay: pending.overlay ?? null });
      const fresh = made && applyStudio(made, this.studio);
      if (fresh && fresh.key === pending.genome.key) pending.genome = fresh;
    }
  }

  takeWave(budget: number, mode: ChatMode, rng: Rng): WavePlan {
    this.refreshEmotes();
    const crowd = mode === 'offline' ? [] : [...resolveCrowd(this.species), ...resolvePatterns(this.species)];
    const orders: SpawnOrder[] = [];
    let remaining = budget;
    let chatThreat = 0;

    if (mode !== 'offline') {
      for (const pending of this.pending) {
        if (remaining < BALANCE.unitCost * 0.5) break;
        // A species too big for what is left waits for the next wave, unless nothing has spawned yet.
        if (speciesCost(pending) > remaining && orders.length > 0) continue;
        const spent = planSpecies(pending, remaining, orders);
        remaining -= spent;
        chatThreat += spent;
        this.species.delete(pending.genome.key);
      }
    } else {
      this.species.clear();
    }

    let wildThreat = 0;
    if (mode !== 'chat-only') {
      while (remaining >= BALANCE.unitCost) {
        const genome = makeWildGenome(rng);
        const packSize = 1 + Math.floor(rng() * 3);
        const pending: PendingSpecies = { genome, text: genome.token, contributions: [], firstAt: 0 };
        for (let i = 0; i < packSize && remaining >= BALANCE.unitCost; i++) {
          const spent = planSpecies(pending, remaining, orders);
          remaining -= spent;
          wildThreat += spent;
        }
      }
    }

    this.perUser.clear();
    return { orders: groupLinked(interleave(orders, rng)), budget, chatThreat, wildThreat, crowd };
  }

  /** Keeps the carry-over backlog bounded by dropping the least popular, oldest species. */
  private trimBacklog(): void {
    while (this.species.size > BALANCE.maxBacklogSpecies) {
      const victim = this.pending[this.pending.length - 1];
      this.species.delete(victim.genome.key);
    }
  }

  private removeWhere(match: (c: Contribution) => boolean): void {
    for (const [key, pending] of this.species) {
      const removed = pending.contributions.filter(match);
      if (removed.length === 0) continue;
      for (const c of removed) this.perUser.set(c.userId, Math.max(0, (this.perUser.get(c.userId) ?? 1) - 1));
      pending.contributions = pending.contributions.filter((c) => !match(c));
      if (pending.contributions.length === 0) this.species.delete(key);
    }
  }
}

interface Token {
  text: string;
  emote: ChatEmote | null;
  /** A 7TV zero-width emote layered on top of this one, as in "KEKW RainTime". */
  overlay?: ChatEmote | null;
}

/**
 * A message counts when it is one word, possibly repeated ("KEKW KEKW KEKW").
 * Longer messages still contribute any emotes inside them, so normal chatter with emotes counts too.
 */
export function extractTokens(message: ChatMessage): Token[] {
  const words = message.text.split(/\s+/).filter(Boolean);
  const unique = [...new Set(words)];
  const emoteByName = new Map(message.emotes.map((e) => [e.name, e]));

  if (unique.length === 1) {
    const word = unique[0];
    return [{ text: word, emote: emoteByName.get(word) ?? null }];
  }
  // In longer messages only emotes, curated names, and emoji count, so sentences do not spawn every word.
  // A zero-width emote layers onto the token before it instead of spawning on its own.
  const tokens: Token[] = [];
  for (const w of words) {
    const emote = emoteByName.get(w) ?? null;
    const previous = tokens[tokens.length - 1];
    if (emote?.zeroWidth && previous && !previous.overlay) {
      previous.overlay = emote;
      continue;
    }
    if (!(emote || CURATED_EMOTES[w] || readEmoji(w))) continue;
    if (tokens.some((t) => t.text === w && !t.overlay)) continue;
    tokens.push({ text: w, emote });
  }
  return tokens;
}

function speciesCost(pending: PendingSpecies): number {
  const rarity = pending.genome.rarity === 'elite' ? BALANCE.eliteMultiplier : 1;
  return rarity * Math.pow(Math.max(1, pending.contributions.length), BALANCE.mergeExponent) * BALANCE.unitCost;
}

/** Adds the orders for one species and returns the threat spent. */
function planSpecies(pending: PendingSpecies, remaining: number, orders: SpawnOrder[]): number {
  const { genome } = pending;
  const copies = Math.max(1, pending.contributions.length);
  const rarity = genome.rarity === 'elite' ? BALANCE.eliteMultiplier : 1;
  let units = rarity * Math.pow(copies, BALANCE.mergeExponent);
  let cost = units * BALANCE.unitCost;
  if (cost > remaining) {
    units = remaining / BALANCE.unitCost;
    cost = remaining;
  }
  const sender = pending.contributions[0]?.userName ?? null;

  const swarm = genome.swarm * (genome.swarm > 1 ? Math.ceil(Math.sqrt(copies)) : 1);
  if (swarm > 1) {
    const members = Math.min(BALANCE.maxSwarmMembers, swarm);
    const each = (units * BALANCE.swarmBonus) / members;
    for (let i = 0; i < members; i++) {
      orders.push({ genome, power: each, scale: 1, cost: cost / members, copies, sender });
    }
  } else {
    const scale = Math.min(BALANCE.maxTitanScale, 1 + 0.35 * Math.log2(copies));
    orders.push({ genome, power: units, scale, cost, copies, sender });
  }
  return cost;
}

/** Mixes Wilds packs into chat orders so the two portals alternate instead of dumping in blocks. */
function interleave(orders: SpawnOrder[], rng: Rng): SpawnOrder[] {
  const chat = orders.filter((o) => o.genome.source === 'chat');
  const wild = orders.filter((o) => o.genome.source === 'wilds');
  const result: SpawnOrder[] = [];
  while (chat.length || wild.length) {
    const takeChat = chat.length && (!wild.length || rng() < chat.length / (chat.length + wild.length));
    result.push((takeChat ? chat : wild).shift()!);
  }
  return result;
}
