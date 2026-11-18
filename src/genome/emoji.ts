/**
 * Emoji follow the word pipeline: each one maps to a word at build time (tools/lexicon/build.ts),
 * so 🔥 reads as fire. A run of the same emoji ("🔥🔥🔥") is a swarm.
 */
import table from './data/emoji.json';

const EMOJI = table as Record<string, string>;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export interface EmojiToken {
  glyph: string;
  word: string;
  count: number;
}

export function readEmoji(token: string): EmojiToken | null {
  const graphemes = [...segmenter.segment(token.trim())].map((s) => s.segment);
  if (graphemes.length === 0 || !/\p{Extended_Pictographic}/u.test(graphemes[0])) return null;
  if (graphemes.some((g) => g !== graphemes[0])) return null;
  const glyph = graphemes[0];
  const word = EMOJI[glyph] ?? EMOJI[glyph.replace(/️/g, '')];
  return word ? { glyph, word, count: graphemes.length } : null;
}
