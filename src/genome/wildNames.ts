/**
 * Invented names for the Wilds. They must read as made-up creatures, never as chat messages,
 * so they are built from syllables that rarely form real words and are always Title Case.
 */
import { pick, type Rng } from './hash';

const ONSETS = ['v', 'k', 'z', 'gr', 'th', 'qu', 'sk', 'br', 'dr', 'm', 'n', 'x', 'ul', 'or', 'y', 'gh', 'sn', 'pr'];
const NUCLEI = ['a', 'o', 'u', 'e', 'i', 'ae', 'ou', 'y'];
const CODAS = ['', '', 'r', 'k', 'g', 'th', 'n', 'x', 'z', 'm', 'lk', 'rb', 'sh'];
const ENDINGS = ['ok', 'ix', 'ath', 'uun', 'ek', 'orb', 'il', 'ag', 'ux', 'yr', 'it', 'ozz'];

export function wildName(rng: Rng): string {
  const syllables = 1 + Math.floor(rng() * 2);
  let name = '';
  for (let i = 0; i < syllables; i++) name += pick(rng, ONSETS) + pick(rng, NUCLEI) + pick(rng, CODAS);
  name += pick(rng, ONSETS) + pick(rng, ENDINGS);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
