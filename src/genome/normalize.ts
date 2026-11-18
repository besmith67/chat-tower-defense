/**
 * Layer 1 input: turn raw chat text into a normalized token plus the surface signals
 * (casing, punctuation, stretching, leetspeak) that later layers turn into traits.
 */

export type CasePattern = 'lower' | 'caps' | 'title' | 'alternating' | 'mixed';
export type PunctuationMood = 'charge' | 'confused' | 'drowsy' | null;

export interface NormalizedToken {
  /** The token exactly as typed, trimmed. */
  raw: string;
  /** Lowercase letters after undoing leetspeak and collapsing stretched letters. */
  root: string;
  /** Lowercase letters before collapsing, so "zzzzz" stays "zzzzz". */
  letters: string;
  casing: CasePattern;
  punctuation: PunctuationMood;
  /** How many letters were removed by collapsing runs of 3 or more, as in "noooooo". */
  stretch: number;
  /** True when digits or symbols stood in for letters, as in "h4x0r". */
  leet: boolean;
  /** Set when the token is a bare number such as "420". */
  number: string | null;
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

export function normalizeToken(input: string): NormalizedToken | null {
  const raw = input.trim();
  if (!raw) return null;

  const punctuation = readPunctuation(raw);
  const core = raw.replace(/^[^\p{L}\p{N}@$]+|[^\p{L}\p{N}]+$/gu, '');
  if (!core) return null;

  if (/^\d+$/.test(core)) {
    return { raw, root: core, letters: core, casing: 'lower', punctuation, stretch: 0, leet: false, number: core };
  }

  const hasLetters = /\p{L}/u.test(core);
  let leet = false;
  let deleeted = '';
  for (const ch of core) {
    if (hasLetters && LEET[ch]) {
      deleeted += LEET[ch];
      leet = true;
    } else {
      deleeted += ch;
    }
  }

  const letters = deleeted.replace(/[^\p{L}]/gu, '');
  if (!letters) return null;

  const lowered = letters.toLowerCase();
  const collapsed = lowered.replace(/(.)\1{2,}/gu, '$1');
  const stretch = lowered.length - collapsed.length;

  return {
    raw,
    root: collapsed,
    letters: lowered,
    casing: readCasing(letters),
    punctuation,
    stretch,
    leet,
    number: null,
  };
}

function readPunctuation(raw: string): PunctuationMood {
  const tail = raw.match(/[!?.]+$/)?.[0] ?? '';
  if (!tail) return null;
  if (tail.includes('?')) return 'confused';
  if (tail.includes('!')) return 'charge';
  if (tail.length >= 2) return 'drowsy';
  return null;
}

function readCasing(letters: string): CasePattern {
  const chars = Array.from(letters).filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (chars.length === 0) return 'lower';
  const upper = chars.map((c) => c === c.toUpperCase());
  const upperCount = upper.filter(Boolean).length;

  if (upperCount === 0) return 'lower';
  if (upperCount === chars.length) return chars.length >= 2 ? 'caps' : 'title';
  if (upper[0] && upperCount === 1) return 'title';

  if (chars.length >= 4) {
    let flips = 0;
    for (let i = 1; i < upper.length; i++) if (upper[i] !== upper[i - 1]) flips++;
    if (flips / (upper.length - 1) >= 0.8) return 'alternating';
  }
  return 'mixed';
}
