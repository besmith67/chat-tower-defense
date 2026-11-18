/**
 * The bestiary (Layer 8): every chat species a channel has ever sent, with credit to the viewer who
 * discovered it. Saved in the browser per channel, so discoveries carry across streams.
 */
import type { SpawnOrder } from './collector';

export interface BestiaryEntry {
  token: string;
  /** The viewer who first sent it. "chat" when names are hidden. */
  discoveredBy: string;
  /** ISO date of the discovery. */
  discoveredAt: string;
  /** Copies chat has sent, across all streams. */
  sent: number;
  /** Times it reached the base. */
  leaks: number;
  element: string | null;
  family: string | null;
  emoteUrl: string | null;
  emoji: string | null;
}

export interface Discovery {
  token: string;
  by: string;
}

export class Bestiary {
  constructor(readonly entries: Record<string, BestiaryEntry> = {}) {}

  get size(): number {
    return Object.keys(this.entries).length;
  }

  /** Records a wave's chat orders. Returns the species seen for the first time. */
  record(orders: SpawnOrder[], today: string): Discovery[] {
    const found: Discovery[] = [];
    const seen = new Set<string>();
    for (const o of orders) {
      const g = o.genome;
      if (g.source !== 'chat' || o.cost === 0 || seen.has(g.key)) continue;
      seen.add(g.key);
      const entry = this.entries[g.key];
      if (entry) {
        entry.sent += o.copies;
        continue;
      }
      const by = o.sender ?? 'chat';
      this.entries[g.key] = {
        token: g.token, discoveredBy: by, discoveredAt: today, sent: o.copies, leaks: 0,
        element: g.element, family: g.family, emoteUrl: g.emote?.url ?? null, emoji: g.emoji,
      };
      found.push({ token: g.token, by });
    }
    return found;
  }

  leak(key: string): void {
    const entry = this.entries[key];
    if (entry) entry.leaks++;
  }

  static load(channel: string, storage: Pick<Storage, 'getItem'> | null = globalStorage()): Bestiary {
    if (!storage) return new Bestiary();
    try {
      const parsed = JSON.parse(storage.getItem(KEY(channel)) ?? '{}');
      return new Bestiary(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      return new Bestiary();
    }
  }

  save(channel: string, storage: Pick<Storage, 'setItem'> | null = globalStorage()): void {
    if (!storage) return;
    try {
      storage.setItem(KEY(channel), JSON.stringify(this.entries));
    } catch {
      // Full or blocked storage: the bestiary lasts for this session only.
    }
  }
}

/** Offline and test-chat games share one local bestiary. */
const KEY = (channel: string) => `ctd.bestiary.${channel.toLowerCase() || 'local'}`;

function globalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
