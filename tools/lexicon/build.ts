/**
 * Offline lexicon builder. Run with `npm run lexicon`.
 *
 * Inputs:
 *   - WordNet 3.1 (wordnet-db): parts of speech, lexicographer files (families), synsets, pointers, glosses.
 *   - SUBTLEX-US word counts (subtlex-word-frequencies): how common a word is in everyday speech.
 *   - data/lexicon/seeds.tsv: hand-scored axes, elements, and family overrides.
 *
 * Output: src/genome/data/lexicon.json, compact entries (see src/genome/lexiconFormat.ts) each mapped to
 * the space-separated words that share it.
 *
 * Axes spread from seeds through WordNet: synonyms copy a seed, and hypernyms, similar-to, derivation,
 * and antonym links pass on a weakened (or negated) copy. Glosses add small nudges for anchor words.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  AXES, AXIS_CODES, ELEMENTS, FAMILIES, encodeEntry, neutralAxes,
  type Ability, type Axes, type Element, type Family, type Pos,
} from '../../src/genome/lexiconFormat';

const require = createRequire(import.meta.url);
const WN: string = require('wordnet-db').path;
const SUBTLEX: { word: string; count: number }[] = require('subtlex-word-frequencies/index.json');

const MIN_COUNT = 2;
const SUBTLEX_TOTAL = 51e6;
const OUT = 'src/genome/data/lexicon.json';

// ---------- WordNet ----------

const SS_POS: Record<string, Pos> = { '1': 'n', '2': 'v', '3': 'a', '4': 'r', '5': 'a' };
const FILE_POS: Record<string, string> = { noun: 'n', verb: 'v', adj: 'a', adv: 'r' };

interface Synset {
  key: string;
  lex: number;
  words: string[];
  pointers: { sym: string; key: string }[];
  gloss: string;
}

const synsets = new Map<string, Synset>();
for (const file of ['noun', 'verb', 'adj', 'adv']) {
  const pos = FILE_POS[file];
  for (const line of readFileSync(join(WN, `data.${file}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const [head, gloss = ''] = line.split(' | ');
    const f = head.trim().split(' ');
    const offset = f[0];
    const lex = Number(f[1]);
    const wCount = parseInt(f[3], 16);
    const words: string[] = [];
    let i = 4;
    for (let w = 0; w < wCount; w++, i += 2) words.push(f[i].toLowerCase().replace(/\(.*\)$/, ''));
    const pCount = Number(f[i++]);
    const pointers: Synset['pointers'] = [];
    for (let p = 0; p < pCount; p++, i += 4) {
      const ptrPos = f[i + 2] === 's' ? 'a' : f[i + 2];
      pointers.push({ sym: f[i], key: ptrPos + f[i + 1] });
    }
    synsets.set(pos + offset, { key: pos + offset, lex, words, pointers, gloss: gloss.split(';')[0] });
  }
}

interface LemmaInfo {
  /** SemCor tag counts per part of speech. */
  tags: Partial<Record<Pos, number>>;
  /** Most frequent synset per part of speech. */
  top: Partial<Record<Pos, { key: string; sense: number }>>;
}

const lemmas = new Map<string, LemmaInfo>();
for (const line of readFileSync(join(WN, 'index.sense'), 'utf8').split('\n')) {
  const m = /^([a-z]+)%(\d):\d+:\d+:[^ ]* (\d+) (\d+) (\d+)$/.exec(line);
  if (!m) continue;
  const [, lemma, ss, offset, senseStr, tagStr] = m;
  if (lemma.length < 2 || lemma.length > 14) continue;
  const pos = SS_POS[ss];
  const info = lemmas.get(lemma) ?? { tags: {}, top: {} };
  info.tags[pos] = (info.tags[pos] ?? 0) + Number(tagStr) + 0.01;
  const sense = Number(senseStr);
  const current = info.top[pos];
  if (!current || sense < current.sense) info.top[pos] = { key: pos + offset, sense };
  lemmas.set(lemma, info);
}

// ---------- Frequency ----------

const counts = new Map<string, number>();
for (const { word, count } of SUBTLEX) {
  const w = word.toLowerCase();
  counts.set(w, (counts.get(w) ?? 0) + count);
}
function zipfOf(word: string): number {
  const count = counts.get(word) ?? 0;
  if (count === 0) return 1;
  return Math.max(1, Math.min(7, Math.round(Math.log10((count / SUBTLEX_TOTAL) * 1e9))));
}

// ---------- Seeds ----------

interface Seed {
  pos: Pos | null;
  family: Family | null;
  element: Element | null;
  axes: Axes;
}

const seeds = new Map<string, Seed>();
for (const [n, raw] of readFileSync('data/lexicon/seeds.tsv', 'utf8').split('\n').entries()) {
  const line = raw.replace(/#.*/, '').trim();
  if (!line) continue;
  const [word, pos, family, element, ...axisTokens] = line.split(/\s+/);
  const fail = (msg: string) => { throw new Error(`seeds.tsv line ${n + 1}: ${msg}: ${raw}`); };
  if (!/^[a-z]+$/.test(word)) fail('word must be lowercase letters');
  if (pos !== '-' && !['n', 'v', 'a', 'r'].includes(pos)) fail('bad part of speech');
  if (family !== '-' && !(FAMILIES as readonly string[]).includes(family)) fail('bad family');
  if (element !== '-' && !(ELEMENTS as readonly string[]).includes(element)) fail('bad element');
  const axes = neutralAxes();
  for (const token of axisTokens) {
    const m = /^([a-z]{2})([+-]\d)$/.exec(token);
    if (!m || !AXIS_CODES[m[1]]) fail(`bad axis token "${token}"`);
    axes[AXIS_CODES[m![1]]] = Number(m![2]);
  }
  if (seeds.has(word)) fail('duplicate seed');
  seeds.set(word, {
    pos: pos === '-' ? null : (pos as Pos),
    family: family === '-' ? null : (family as Family),
    element: element === '-' ? null : (element as Element),
    axes,
  });
}

function posOrder(info: LemmaInfo | undefined, seed: Seed | undefined): Pos[] {
  const order: Pos[] = info
    ? (Object.keys(info.tags) as Pos[]).sort((a, b) => (info.tags[b]! - info.tags[a]!) || 'nvar'.indexOf(a) - 'nvar'.indexOf(b))
    : [];
  if (seed?.pos) return [seed.pos, ...order.filter((p) => p !== seed.pos)];
  return order.length ? order : ['n'];
}

// Seeds mark the synset of their main sense, so synonyms and neighbors can inherit.
const seededSynsets = new Map<string, Seed>();
for (const [word, seed] of seeds) {
  const info = lemmas.get(word);
  if (!info) continue;
  const pos = posOrder(info, seed)[0];
  const top = info.top[pos];
  if (top && !seededSynsets.has(top.key)) seededSynsets.set(top.key, seed);
}

const LINK_WEIGHT: Record<string, number> = {
  '@': 0.7, '@i': 0.8, '&': 0.8, '+': 0.8, '\\': 0.8, '^': 0.6, '!': -0.8,
};

function inherit(start: string): { seed: Seed; weight: number } | null {
  const direct = seededSynsets.get(start);
  if (direct) return { seed: direct, weight: 1 };
  let frontier = [{ key: start, weight: 1 }];
  const seen = new Set([start]);
  for (let depth = 0; depth < 3; depth++) {
    let best: { seed: Seed; weight: number } | null = null;
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const ptr of synsets.get(node.key)?.pointers ?? []) {
        const w = LINK_WEIGHT[ptr.sym];
        if (w === undefined || seen.has(ptr.key)) continue;
        seen.add(ptr.key);
        const weight = node.weight * w;
        const hit = seededSynsets.get(ptr.key);
        if (hit && (!best || Math.abs(weight) > Math.abs(best.weight))) best = { seed: hit, weight };
        if (weight > 0) next.push({ key: ptr.key, weight });
      }
    }
    if (best) return best;
    frontier = next;
  }
  return null;
}

// ---------- Gloss anchors ----------

const AXIS_ANCHORS: [keyof Axes, number, RegExp][] = [
  ['speed', 1, /\b(fast|quick|quickly|rapid|rapidly|swift|swiftly|speed|hurry|rush|race)\b/],
  ['speed', -1, /\b(slow|slowly|sluggish|crawl|crawling|lazy|leisurely)\b/],
  ['mass', 1, /\b(large|huge|giant|enormous|big|heavy|massive|vast)\b/],
  ['mass', -1, /\b(small|tiny|little|minute|miniature|speck)\b/],
  ['hardness', 1, /\b(hard|metal|steel|iron|stone|rock|armor|armour|shell|rigid)\b/],
  ['hardness', -1, /\b(soft|squishy|jelly|liquid|fluffy|tender)\b/],
  ['heat', 1, /\b(hot|heat|fire|burn|burning|flame|warm|lava)\b/],
  ['heat', -1, /\b(cold|ice|icy|frozen|snow|freeze|frost|chill)\b/],
  ['life', 1, /\b(alive|living|grow|growing|growth|birth)\b/],
  ['life', -1, /\b(dead|death|die|corpse|bone|bones|decay)\b/],
  ['mood', 1, /\b(hostile|angry|anger|attack|violent|violence|fight|aggressive|harm)\b/],
  ['mood', -1, /\b(friendly|kind|love|gentle|help|affection|pleasant)\b/],
  ['order', 1, /\b(chaotic|chaos|wild|random|disorder|confusion|unpredictable)\b/],
  ['order', -1, /\b(calm|orderly|still|regular|steady)\b/],
  ['presence', 1, /\b(loud|bright|noise|noisy|shine|shining|visible|explosion)\b/],
  ['presence', -1, /\b(quiet|quietly|hidden|hide|dark|shadow|secret|silent|stealth)\b/],
];

const ELEMENT_ANCHORS: [Element, RegExp][] = [
  ['fire', /\b(fire|flame|flames|burn|burning|lava|ember|embers|blaze|smoke)\b/],
  ['frost', /\b(ice|icy|snow|frozen|frost|freeze|freezing|glacier)\b/],
  ['storm', /\b(storm|lightning|thunder|electric|electricity|wind|tornado|hurricane)\b/],
  ['venom', /\b(poison|poisonous|venom|venomous|toxic|sting|stinging|acid|disease|infection)\b/],
  ['stone', /\b(stone|rock|rocks|metal|iron|steel|mineral|boulder)\b/],
  ['spirit', /\b(ghost|spirit|soul|supernatural|magic|magical|deity|demon|angel|holy)\b/],
];

// ---------- Abilities ----------

/** Seed verbs per ability. Other verbs inherit through synonyms and close WordNet links. */
const ABILITY_SEEDS: Record<Ability, string[]> = {
  sprint: ['run', 'sprint', 'dash', 'rush', 'race', 'hurry', 'flee', 'charge', 'zoom', 'speed', 'bolt', 'zip'],
  hop: ['jump', 'hop', 'leap', 'bounce', 'skip', 'vault', 'spring', 'yeet', 'fly'],
  burrow: ['dig', 'burrow', 'tunnel', 'drill', 'bury', 'excavate'],
  stealth: ['hide', 'sneak', 'lurk', 'creep', 'stalk', 'vanish', 'disappear', 'camouflage'],
  heal: ['heal', 'mend', 'fix', 'cure', 'repair', 'regenerate', 'restore', 'nurse'],
  split: ['split', 'divide', 'clone', 'multiply', 'duplicate', 'breed', 'replicate', 'copy'],
  steal: ['steal', 'rob', 'yoink', 'grab', 'loot', 'snatch', 'pickpocket', 'plunder', 'take'],
  explode: ['explode', 'burst', 'detonate', 'erupt', 'shatter', 'blast', 'blow', 'pop'],
};

const abilitySynsets = new Map<string, Ability>();
for (const [ability, verbs] of Object.entries(ABILITY_SEEDS) as [Ability, string[]][]) {
  for (const verb of verbs) {
    const key = lemmas.get(verb)?.top.v?.key;
    if (key && !abilitySynsets.has(key)) abilitySynsets.set(key, ability);
  }
}
const seedAbility = new Map<string, Ability>();
for (const [ability, verbs] of Object.entries(ABILITY_SEEDS) as [Ability, string[]][]) for (const v of verbs) seedAbility.set(v, ability);

/** A verb's ability: its own seed, its main synset, or a hypernym or derivation one step away. */
function abilityOf(word: string, info: LemmaInfo | undefined): Ability | null {
  const own = seedAbility.get(word);
  if (own) return own;
  const key = info?.top.v?.key;
  if (!key) return null;
  const direct = abilitySynsets.get(key);
  if (direct) return direct;
  for (const ptr of synsets.get(key)?.pointers ?? []) {
    if (ptr.sym !== '@' && ptr.sym !== '+') continue;
    const hit = abilitySynsets.get(ptr.key);
    if (hit) return hit;
  }
  return null;
}

// ---------- Families ----------

const NOUN_FAMILY: Record<number, Family> = {
  5: 'beast', 20: 'beast', 6: 'construct', 13: 'food', 18: 'person', 8: 'body',
  15: 'place', 17: 'place', 19: 'elemental', 27: 'elemental',
};

// ---------- Build ----------

const words: Record<string, string> = {};
const stats = { total: 0, seeded: 0, inherited: 0, glossOnly: 0, families: {} as Record<string, number>, elements: {} as Record<string, number>, abilities: {} as Record<string, number> };

const candidates = new Set<string>(seeds.keys());
for (const lemma of lemmas.keys()) if ((counts.get(lemma) ?? 0) >= MIN_COUNT) candidates.add(lemma);

for (const word of [...candidates].sort()) {
  const info = lemmas.get(word);
  const seed = seeds.get(word);
  const pos = posOrder(info, seed);
  const top = info?.top[pos[0]];
  const synset = top ? synsets.get(top.key) : undefined;

  let axes = neutralAxes();
  let element: Element | null = null;
  if (seed) {
    axes = { ...seed.axes };
    element = seed.element;
    stats.seeded++;
  } else if (top) {
    const hit = inherit(top.key);
    if (hit) {
      for (const a of AXES) axes[a] = Math.round(hit.seed.axes[a] * hit.weight);
      if (hit.weight >= 0.5) element = hit.seed.element;
      stats.inherited++;
    }
  }

  if (!seed && synset) {
    let nudged = false;
    for (const [axis, dir, re] of AXIS_ANCHORS) {
      if (axes[axis] === 0 && re.test(synset.gloss)) {
        axes[axis] = dir;
        nudged = true;
      }
    }
    if (!element) {
      for (const [el, re] of ELEMENT_ANCHORS) {
        if (re.test(synset.gloss)) { element = el; nudged = true; break; }
      }
    }
    if (nudged && !inherit(top!.key)) stats.glossOnly++;
  }

  // Family is a body plan, so only words used mainly as nouns get one from WordNet.
  let family: Family | null = seed?.family ?? null;
  if (!family && pos[0] === 'n' && info?.top.n) family = NOUN_FAMILY[synsets.get(info.top.n.key)?.lex ?? -1] ?? 'abstract';

  // Chat slang is missing from the subtitle counts but is common in chat, so seeds are never rare.
  const zipf = seed ? Math.max(zipfOf(word), 4) : zipfOf(word);
  const ability = pos[0] === 'v' ? abilityOf(word, info) : null;
  if (ability) stats.abilities[ability] = (stats.abilities[ability] ?? 0) + 1;
  words[word] = encodeEntry(pos, family, element, zipf, axes, ability);
  stats.total++;
  if (family) stats.families[family] = (stats.families[family] ?? 0) + 1;
  if (element) stats.elements[element] = (stats.elements[element] ?? 0) + 1;
}

// Group words by identical entry so the file is mostly bare words: { entry: "word word word" }.
const groups: Record<string, string[]> = {};
for (const [word, entry] of Object.entries(words)) (groups[entry] ??= []).push(word);
const grouped = Object.fromEntries(Object.entries(groups).map(([entry, list]) => [entry, list.join(' ')]));
const json = JSON.stringify({ version: 1, groups: grouped });
writeFileSync(OUT, json + '\n');
console.log(`Wrote ${OUT}: ${stats.total} words, ${(json.length / 1024).toFixed(0)} KB`);
console.log(`  seeded ${stats.seeded}, inherited ${stats.inherited}, gloss only ${stats.glossOnly}`);
console.log('  families', stats.families);
console.log('  elements', stats.elements);
console.log('  abilities', stats.abilities);
