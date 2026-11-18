/**
 * Hand-designed archetypes for the most spammed emotes and meme numbers.
 * Matching is case-sensitive for emotes because chat types them exactly.
 */
import type { Quirk, StatWeights } from './types';

export interface Archetype {
  title: string;
  quirks: Quirk[];
  /** Overrides the computed stat weights when present. */
  weights?: StatWeights;
  /** Multiplies body radius. */
  scale?: number;
  elite?: boolean;
}

export const CURATED_EMOTES: Record<string, Archetype> = {
  KEKW: { title: 'Cackler', quirks: ['stunburst'], weights: { hp: 0.5, speed: 0.3, armor: 0.2 } },
  LUL: { title: 'Giggle Brood', quirks: ['splitter'] },
  PogChamp: { title: 'Hype Herald', quirks: ['hype'], weights: { hp: 0.35, speed: 0.45, armor: 0.2 } },
  monkaS: { title: 'Nervous Wreck', quirks: ['panic'], weights: { hp: 0.3, speed: 0.5, armor: 0.2 } },
  Copium: { title: 'Huffer', quirks: ['cope'], weights: { hp: 0.55, speed: 0.2, armor: 0.25 } },
  Sadge: { title: 'Raincloud', quirks: ['gloom'], weights: { hp: 0.5, speed: 0.25, armor: 0.25 } },
  EZ: { title: 'Smug', quirks: ['shielded'], weights: { hp: 0.3, speed: 0.4, armor: 0.3 } },
  Kappa: { title: 'Trickster', quirks: ['blink'] },
  catJAM: { title: 'Vibe Cat', quirks: ['rhythm'], weights: { hp: 0.35, speed: 0.45, armor: 0.2 } },
  OMEGALUL: { title: 'Laugh Orb', quirks: [], weights: { hp: 0.75, speed: 0.1, armor: 0.15 }, scale: 1.5, elite: true },
};

export const CURATED_NUMBERS: Record<string, Archetype> = {
  '69': { title: 'Nice', quirks: ['mirror'], weights: { hp: 0.45, speed: 0.3, armor: 0.25 } },
  '420': { title: 'Haze', quirks: ['drowsy', 'gloom'], weights: { hp: 0.55, speed: 0.15, armor: 0.3 } },
  '1337': { title: 'Elite Haxor', quirks: ['cyber', 'blink'], elite: true },
};
