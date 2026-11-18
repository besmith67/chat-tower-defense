/**
 * Layer 2: Form. How a word looks and sounds. This layer alone must produce an interesting
 * monster, because it is the fallback for every token the meaning layer does not know.
 */
import { clamp } from './hash';

export interface FormGenes {
  /** -1 is fully round (bouba), +1 is fully spiky (kiki). */
  sharpness: number;
  syllables: number;
  vowels: number;
  /** Runs of two or more consonants, such as "str". These become horns. */
  clusters: number;
  length: number;
  /** Average Scrabble value per letter. High values make elites. */
  letterValue: number;
  /** Number of monsters when the word is one short chunk repeated, as in "hahaha" or "zzzzz". */
  swarm: number;
  /** The repeated chunk when swarm is above 1. */
  swarmUnit: string | null;
  palindrome: boolean;
}

const VOWELS = new Set('aeiouy');
// Sound symbolism (the bouba/kiki effect). Voiceless stops, sibilant-ish sharp letters, and front
// vowels read as spiky. Sonorants, voiced stops, and rounded back vowels read as round.
const SHARP = new Set('kptqxzcie');
const ROUND = new Set('bmlnouwgd');

const SCRABBLE: Record<string, number> = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

/**
 * @param root normalized lowercase root, with runs of 3+ letters already collapsed
 * @param original lowercase letters before collapsing, used to spot repeated chunks
 */
export function readForm(root: string, original: string = root): FormGenes {
  const letters = Array.from(root).filter((c) => /\p{L}/u.test(c));
  const ascii = letters.filter((c) => c >= 'a' && c <= 'z');

  let sharp = 0;
  let round = 0;
  for (const c of ascii) {
    if (SHARP.has(c)) sharp++;
    if (ROUND.has(c)) round++;
  }
  const sharpness = sharp + round === 0 ? 0 : (sharp - round) / (sharp + round);

  const vowelGroups = root.match(/[aeiouy]+/g) ?? [];
  let syllables = vowelGroups.length;
  if (syllables > 1 && root.endsWith('e') && !root.endsWith('le')) syllables--;
  syllables = Math.max(1, syllables);

  const vowels = ascii.filter((c) => VOWELS.has(c)).length;
  const clusters = (root.match(/[bcdfghjklmnpqrstvwxz]{2,}/g) ?? []).length;

  const letterValue = ascii.length === 0
    ? 2
    : ascii.reduce((sum, c) => sum + (SCRABBLE[c] ?? 1), 0) / ascii.length;

  const { swarm, swarmUnit } = readRepetition(original);

  return {
    sharpness,
    syllables,
    vowels,
    clusters,
    length: letters.length,
    letterValue,
    swarm,
    swarmUnit,
    palindrome: letters.length >= 3 && letters.join('') === [...letters].reverse().join(''),
  };
}

/** Detect a short chunk repeated at least three times, such as "ha" in "hahaha" or "z" in "zzzzz". */
function readRepetition(word: string): { swarm: number; swarmUnit: string | null } {
  const chars = Array.from(word);
  for (let period = 1; period <= 3; period++) {
    const reps = Math.floor(chars.length / period);
    if (reps < 3) continue;
    let matches = true;
    for (let i = period; i < reps * period; i++) {
      if (chars[i] !== chars[i % period]) {
        matches = false;
        break;
      }
    }
    // Allow one leftover partial chunk, as in "hahah".
    const leftover = chars.slice(reps * period);
    if (matches && leftover.every((c, i) => c === chars[i])) {
      return { swarm: clamp(reps, 3, 10), swarmUnit: chars.slice(0, period).join('') };
    }
  }
  return { swarm: 1, swarmUnit: null };
}
