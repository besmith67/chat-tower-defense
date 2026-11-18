/**
 * Tower sabotage (Layer 7). Words that counter a tower type become saboteurs that jam towers of
 * that type as they pass. Chat watches the build and types the counter: the most direct
 * chat-versus-streamer play in the game. Lists are short on purpose so chat can learn them.
 */
import type { Genome } from '../genome';
import type { TowerId } from './towers';

export const SABOTAGE: Record<TowerId, string[]> = {
  flame: ['water', 'rain', 'wet', 'flood', 'ocean', 'river', 'extinguish', 'douse', 'splash', 'sponge'],
  frost: ['heat', 'melt', 'thaw', 'sun', 'warm', 'heater', 'lava', 'summer'],
  tesla: ['ground', 'rubber', 'mud', 'dirt', 'earth', 'insulator', 'sand', 'clay'],
  needle: ['armor', 'shield', 'plate', 'dull', 'bend', 'thimble', 'helmet', 'cork'],
  hammer: ['pillow', 'jelly', 'cushion', 'bounce', 'rubberband', 'trampoline', 'foam', 'mattress'],
};

const BY_WORD = new Map<string, TowerId>();
for (const [tower, words] of Object.entries(SABOTAGE) as [TowerId, string[]][]) for (const w of words) BY_WORD.set(w, tower);

/** The tower type this monster jams, from its dictionary word or its typed root. */
export function sabotageTarget(genome: Genome): TowerId | null {
  if (genome.source !== 'chat') return null;
  return BY_WORD.get(genome.meaning?.lemma ?? '') ?? BY_WORD.get(genome.root) ?? null;
}

/** Saboteurs jam matching towers within this distance, for this long, at most this often. */
export const JAM_RANGE = 90;
export const JAM_SECONDS = 2.5;
export const JAM_EVERY = 5;
