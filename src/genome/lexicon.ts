/**
 * Runtime side of the meaning layer: look up what a word means.
 * The data is built offline by tools/lexicon/build.ts. No model runs in the browser.
 */
import data from './data/lexicon.json';
import { decodeEntry, type DecodedEntry } from './lexiconFormat';

export interface WordInfo extends DecodedEntry {
  /** The dictionary form that matched, such as "run" for "running". */
  lemma: string;
  /** How the token was changed to find the lemma. Null for an exact hit. */
  inflection: string | null;
}

let table: Map<string, string> | null = null;

function words(): Map<string, string> {
  if (table) return table;
  table = new Map();
  for (const [entry, list] of Object.entries((data as { groups: Record<string, string> }).groups)) {
    for (const word of list.split(' ')) table.set(word, entry);
  }
  return table;
}

export function lexiconSize(): number {
  return words().size;
}

/** Irregular forms chat is likely to type. Morphy's exception lists are much longer; add as needed. */
const IRREGULAR: Record<string, [string, string]> = {
  wolves: ['wolf', 'plural'], knives: ['knife', 'plural'], leaves: ['leaf', 'plural'], lives: ['life', 'plural'],
  mice: ['mouse', 'plural'], geese: ['goose', 'plural'], teeth: ['tooth', 'plural'], feet: ['foot', 'plural'],
  children: ['child', 'plural'], people: ['person', 'plural'], men: ['man', 'plural'], women: ['woman', 'plural'],
  elves: ['elf', 'plural'], dwarves: ['dwarf', 'plural'], cacti: ['cactus', 'plural'], fungi: ['fungus', 'plural'],
  ran: ['run', 'past'], ate: ['eat', 'past'], flew: ['fly', 'past'], froze: ['freeze', 'past'], frozen: ['freeze', 'past'],
  dug: ['dig', 'past'], hid: ['hide', 'past'], stole: ['steal', 'past'], threw: ['throw', 'past'], bit: ['bite', 'past'],
  fought: ['fight', 'past'], swam: ['swim', 'past'], slept: ['sleep', 'past'], grew: ['grow', 'past'], died: ['die', 'past'],
  better: ['good', 'comparative'], best: ['good', 'superlative'], worse: ['bad', 'comparative'], worst: ['bad', 'superlative'],
};

/** Suffix rules from WordNet's morphy, in order. Each maps an inflected ending to a base ending. */
const INFLECTIONS: [string, string, string][] = [
  ['ies', 'y', 'plural'], ['ses', 's', 'plural'], ['xes', 'x', 'plural'], ['zes', 'z', 'plural'],
  ['ches', 'ch', 'plural'], ['shes', 'sh', 'plural'], ['men', 'man', 'plural'], ['s', '', 'plural'],
  ['ing', 'e', 'ing'], ['ing', '', 'ing'], ['ed', 'e', 'past'], ['ed', '', 'past'], ['es', 'e', 'plural'],
  ['er', '', 'comparative'], ['er', 'e', 'comparative'],
];

/**
 * Finds a word's meaning. Tries the token as-is, then a version with stretched letters kept double
 * ("sleeeep" to "sleep"), then common inflections ("running" to "run", "foxes" to "fox").
 */
export function lookupWord(root: string, letters: string = root): WordInfo | null {
  const table = words();
  const tries = [root];
  const doubled = letters.replace(/(.)\1{2,}/g, '$1$1');
  if (doubled !== root) tries.push(doubled);

  for (const word of tries) {
    const exact = table.get(word);
    const irregular = IRREGULAR[word];
    if (irregular && !exact) {
      const base = table.get(irregular[0]);
      if (base) return { ...decodeEntry(base), lemma: irregular[0], inflection: irregular[1] };
    }
    if (!exact) continue;
    const info: WordInfo = { ...decodeEntry(exact), lemma: word, inflection: null };
    // WordNet lists many gerunds as their own nouns ("digging"). Chat means the verb, so prefer
    // the verb stem unless the exact word names a concrete thing ("building").
    const verb = /(ing|ed)$/.test(word) && (!info.family || info.family === 'abstract') ? stemOf(word) : null;
    if (verb && verb.pos.includes('v') && verb.zipf >= info.zipf) return verb;
    return info;
  }
  for (const word of tries) {
    const hit = stemOf(word);
    if (hit) return hit;
  }
  return null;
}

function stemOf(word: string): WordInfo | null {
  const table = words();
  for (const [suffix, base, kind] of INFLECTIONS) {
    if (word.length <= suffix.length + 1 || !word.endsWith(suffix)) continue;
    let stem = word.slice(0, -suffix.length) + base;
    let hit = table.get(stem);
    // "running" to "runn" to "run"
    if (!hit && base === '' && /(.)\1$/.test(stem)) {
      stem = stem.slice(0, -1);
      hit = table.get(stem);
    }
    if (hit) return { ...decodeEntry(hit), lemma: stem, inflection: kind };
  }
  return null;
}
