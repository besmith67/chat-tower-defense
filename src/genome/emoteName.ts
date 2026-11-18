/**
 * Layer 6: reading an emote's name. Channel emotes are a channel prefix plus a meaningful suffix
 * ("pokiHype", "xqcL"), and third-party emotes are often a creature plus an action ("catJAM",
 * "peepoHappy"). The suffix runs through the word pipeline; a noun prefix can lend its body plan.
 */

export interface EmoteNameParts {
  prefix: string;
  suffix: string;
}

/**
 * Emote suffixes that mean something other than the plain English word, mapped to the lexicon word
 * that carries their meaning. "L" in an emote name is a heart, not a loss.
 */
export const EMOTE_SUFFIXES: Record<string, string> = {
  l: 'love', w: 'win', h: 'heart', hi: 'hello', gg: 'gg', pog: 'pog', pogu: 'pog', kek: 'kek', ez: 'ez',
  hype: 'hype', rage: 'rage', mad: 'mad', sad: 'sad', cry: 'cry', clap: 'clap', sleep: 'sleep',
  lurk: 'lurker', comfy: 'calm', hug: 'hug', pray: 'holy', wave: 'hello', lul: 'laugh', lol: 'laugh',
  laugh: 'laugh', heart: 'heart', love: 'love', gasm: 'happy', s: 'fear', smile: 'happy', dance: 'dance',
  jam: 'dance', wiggle: 'dance', run: 'run', rip: 'dead', f: 'f', bonk: 'bonk', shrug: 'calm', think: 'smart',
};

/**
 * Splits "pokiHype" into poki + Hype, "xqcL" into xqc + L, and "PepeLaugh" into Pepe + Laugh.
 * Returns null when there is no lowercase-to-uppercase boundary, as in "KEKW" or "monka".
 */
export function splitEmoteName(name: string): EmoteNameParts | null {
  const m = /^([A-Za-z][a-z0-9]+)([A-Z][A-Za-z0-9]*)$/.exec(name);
  if (!m) return null;
  return { prefix: m[1], suffix: m[2] };
}
