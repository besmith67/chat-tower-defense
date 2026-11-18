import type { FormGenes } from './form';
import type { Ability, Axes, Element, Family, Pos } from './lexiconFormat';
import type { CasePattern, PunctuationMood } from './normalize';

export type MonsterSource = 'chat' | 'wilds';
export type Rarity = 'common' | 'elite';
export type FormClass = 'spiky' | 'round' | 'balanced';

/**
 * Behaviors the simulation knows how to run. Generator layers grant quirks; the sim implements them.
 * Keep each quirk small and readable on stream.
 */
export type Quirk =
  | 'enraged'   // ALL CAPS: speeds up as it loses health
  | 'mocking'   // aLtErNaTiNg case: towers in range must target it first
  | 'charge'    // trailing "!": periodic speed bursts
  | 'confused'  // trailing "?": erratic speed
  | 'drowsy'    // trailing "...": slow, and towers see it at a shorter range
  | 'mirror'    // palindrome: reflects some hits
  | 'cyber'     // leetspeak: extra armor
  | 'stunburst' // stuns the nearest tower when it dies
  | 'splitter'  // splits into minis when it dies
  | 'hype'      // speeds up nearby monsters
  | 'panic'     // sprints for a moment after each hit
  | 'cope'      // heals after a big hit
  | 'gloom'     // slows the fire rate of nearby towers
  | 'shielded'  // ignores the first hit
  | 'blink'     // teleports forward every few seconds
  | 'rhythm'    // moves in bursts on a beat
  | 'regen'     // meaning: alive. Heals over time
  | 'undying'   // meaning: undead. Gets back up once
  | 'stealth'   // meaning: hidden, or a sneaking verb. Towers spot it late
  | 'hop'       // verb: leaps forward every few seconds
  | 'burrow'    // verb: dives underground, untargetable for a moment
  | 'healer'    // verb: heals monsters around it
  | 'thief'     // verb: steals gold if it reaches the base
  | 'herald';   // adjective: an aura that buffs monsters around it

export interface StatWeights {
  hp: number;
  speed: number;
  armor: number;
}

export interface Look {
  hue: number;
  saturation: number;
  lightness: number;
  radius: number;
  /** Trailing body segments, from syllables. */
  segments: number;
  eyes: number;
  horns: number;
  /** Number of points on a spiky body outline. */
  points: number;
  /** Phase offset for idle animation. */
  phase: number;
}

export interface EmoteRef {
  provider: 'twitch' | '7tv' | 'bttv' | 'ffz';
  id: string;
  url: string;
}

/** What the token means, from the lexicon (Layer 3). */
export interface Meaning {
  /** Dictionary form that matched, such as "wolf" for "wolves". */
  lemma: string;
  pos: Pos;
  axes: Axes;
  /** An uncommon word. Rare words become elites. */
  rare: boolean;
  /** Verbs only: the ability the verb maps to. */
  ability: Ability | null;
}

export interface Genome {
  /** Species identity. Identical keys merge in a spawn window. */
  key: string;
  /** The token as typed. Shown on the nameplate. */
  token: string;
  root: string;
  source: MonsterSource;
  seed: number;
  rarity: Rarity;
  formClass: FormClass;
  form: FormGenes;
  casing: CasePattern;
  punctuation: PunctuationMood;
  quirks: Quirk[];
  weights: StatWeights;
  look: Look;
  /** How many monsters one copy of this token becomes. Above 1 for tokens like "hahaha". */
  swarm: number;
  /** Set for curated emotes and meme numbers. Shown in the inspect panel. */
  archetype: string | null;
  emote: EmoteRef | null;
  /** Null for invented words, Wilds, numbers, and curated archetypes. */
  meaning: Meaning | null;
  element: Element | null;
  family: Family | null;
}
