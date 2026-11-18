/**
 * Emote Studio settings: the streamer's per-channel choices for their emotes. Saved in the browser,
 * keyed by channel. The collector applies them to every emote species chat sends.
 */
import type { Genome } from '../genome';
import { ABILITY_QUIRK } from '../genome/genome';
import type { Ability } from '../genome/lexiconFormat';

export interface StudioEntry {
  /** Chat can still type it, but it spawns nothing. */
  disabled?: boolean;
  /** Shown on the nameplate instead of the emote name. */
  name?: string;
  /** A signature ability the streamer picked, added on top of the generated genes. */
  ability?: Ability;
  /** Marked as a boss candidate for boss votes. */
  boss?: boolean;
}

/** Keyed by emote id. */
export type StudioConfig = Record<string, StudioEntry>;

/** Returns the genome with the streamer's choices applied, or null if the emote is disabled. */
export function applyStudio(genome: Genome, config: StudioConfig): Genome | null {
  const entry = genome.emote ? config[genome.emote.id] : undefined;
  if (!entry) return genome;
  if (entry.disabled) return null;
  const quirk = entry.ability ? ABILITY_QUIRK[entry.ability] : null;
  return {
    ...genome,
    token: entry.name?.trim() ? entry.name.trim().slice(0, 20) : genome.token,
    // The signature ability goes first, so it survives the three-quirk display limit.
    quirks: quirk ? [quirk, ...genome.quirks.filter((q) => q !== quirk)].slice(0, 3) : genome.quirks,
  };
}

const KEY = (channel: string) => `ctd.studio.${channel.toLowerCase()}`;

export function loadStudio(channel: string, storage: Pick<Storage, 'getItem'> | null = globalStorage()): StudioConfig {
  if (!channel || !storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(KEY(channel)) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStudio(channel: string, config: StudioConfig, storage: Pick<Storage, 'setItem'> | null = globalStorage()): void {
  if (!channel || !storage) return;
  // Drop entries that hold no choices, so the saved file stays small.
  const trimmed = Object.fromEntries(Object.entries(config).filter(([, e]) => e.disabled || e.name || e.ability || e.boss));
  try {
    storage.setItem(KEY(channel), JSON.stringify(trimmed));
  } catch {
    // Storage can be full or blocked. Settings then last only for this session.
  }
}

function globalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
