/**
 * Blocked text produces nothing at all, so there is no reward for typing it.
 * Uses the obscenity package's English dataset, which also catches leetspeak and stretched spellings.
 */
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const streamerBlocklist = new Set<string>();

export function setStreamerBlocklist(words: Iterable<string>): void {
  streamerBlocklist.clear();
  for (const w of words) {
    const clean = w.trim().toLowerCase();
    if (clean) streamerBlocklist.add(clean);
  }
}

export function isBlocked(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const word of streamerBlocklist) if (lower.includes(word)) return true;
  return matcher.hasMatch(text);
}
