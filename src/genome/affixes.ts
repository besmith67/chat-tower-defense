/**
 * Layer 3 extras: typo mutants and affixes. Both apply only to tokens the lexicon does not know,
 * so real words always keep their own meaning ("return" is not re- plus "turn").
 */
import { lookupWord, type WordInfo } from './lexicon';
import type { Axes } from './lexiconFormat';

export type Affix = 'mega' | 'mini' | 'un' | 'est' | 're';

export interface ParsedWord {
  word: WordInfo;
  affix: Affix | null;
  /** Set when the token is a one-letter slip of a known word, such as "fier" for "fire". */
  typoOf: string | null;
}

const PREFIXES: [string, Affix][] = [
  ['mega', 'mega'], ['ultra', 'mega'], ['giga', 'mega'], ['mini', 'mini'], ['anti', 'un'], ['un', 'un'], ['re', 're'],
];
const SUFFIXES: [string, Affix][] = [['ling', 'mini'], ['let', 'mini'], ['est', 'est']];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Finds the meaning of a token, directly, through an affix, or as a typo, in that order. */
export function parseWord(root: string, letters: string = root): ParsedWord | null {
  const direct = lookupWord(root, letters);
  if (direct) return { word: direct, affix: null, typoOf: null };

  for (const [prefix, affix] of PREFIXES) {
    if (!root.startsWith(prefix) || root.length - prefix.length < 3) continue;
    const word = lookupWord(root.slice(prefix.length));
    if (word) return { word, affix, typoOf: null };
  }
  for (const [suffix, affix] of SUFFIXES) {
    if (!root.endsWith(suffix) || root.length - suffix.length < 3) continue;
    let stem = root.slice(0, -suffix.length);
    let word = lookupWord(stem);
    // "biggest" to "bigg" to "big", "nicest" to "nic" to "nice"
    if (!word && /(.)\1$/.test(stem)) word = lookupWord((stem = stem.slice(0, -1)));
    if (!word) word = lookupWord(stem + 'e');
    if (word) return { word, affix, typoOf: null };
  }

  const typo = nearestWord(root);
  return typo ? { word: typo, affix: null, typoOf: typo.lemma } : null;
}

/**
 * The most common known word one edit away (a swap, a missing letter, an extra letter, or a wrong
 * letter). Only common words count, so a typo maps to what chat most likely meant.
 */
function nearestWord(token: string): WordInfo | null {
  if (token.length < 4) return null;
  let best: WordInfo | null = null;
  const consider = (candidate: string) => {
    if (candidate === token) return;
    const hit = lookupWord(candidate);
    if (hit && hit.zipf >= 4 && hit.inflection === null && (!best || hit.zipf > best.zipf)) best = hit;
  };
  for (let i = 0; i < token.length; i++) {
    consider(token.slice(0, i) + token.slice(i + 1));
    if (i < token.length - 1) consider(token.slice(0, i) + token[i + 1] + token[i] + token.slice(i + 2));
    for (const c of ALPHABET) {
      consider(token.slice(0, i) + c + token.slice(i + 1));
      consider(token.slice(0, i) + c + token.slice(i));
    }
  }
  for (const c of ALPHABET) consider(token + c);
  return best;
}

/** "un-" and "anti-" flip the root's strongest axis. */
export function flipStrongest(axes: Axes): Axes {
  const entries = Object.entries(axes) as [keyof Axes, number][];
  const [axis] = entries.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  return { ...axes, [axis]: -axes[axis] };
}
