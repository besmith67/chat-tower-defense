/**
 * The monster generator. Pure and deterministic: the same token always yields the same species.
 * See docs/MONSTER_GENERATION.md for the full layer design. Implemented so far:
 * Layer 1 (identity), Layer 2 (form), Layer 3 (meaning), and the curated part of Layer 6 (emotes).
 */
import { CURATED_EMOTES, CURATED_NUMBERS, type Archetype } from './curated';
import { readForm, type FormGenes } from './form';
import { clamp, fnv1a, mulberry32, pick, type Rng } from './hash';
import { lookupWord } from './lexicon';
import { ELEMENTS, type Element } from './lexiconFormat';
import { normalizeToken, type NormalizedToken } from './normalize';
import { isBlocked } from './safety';
import type { EmoteRef, FormClass, Genome, Look, Meaning, MonsterSource, Quirk, StatWeights } from './types';
import { wildName } from './wildNames';

export interface GenomeOptions {
  source?: MonsterSource;
  emote?: EmoteRef | null;
}

/** Returns null for empty or blocked tokens. Blocked tokens never spawn anything. */
export function makeGenome(token: string, options: GenomeOptions = {}): Genome | null {
  const source = options.source ?? 'chat';
  const emote = options.emote ?? null;
  if (isBlocked(token)) return null;

  const norm = normalizeToken(token);
  if (!norm) return null;

  const archetype = norm.number !== null ? CURATED_NUMBERS[norm.number] : CURATED_EMOTES[norm.raw.replace(/[!?.]+$/, '')];
  const key = speciesKey(source, norm, emote);
  const seed = fnv1a(key);
  const rng = mulberry32(seed);

  const form = readForm(norm.root, norm.letters);
  const formClass: FormClass = form.sharpness > 0.25 ? 'spiky' : form.sharpness < -0.25 ? 'round' : 'balanced';
  const quirks = archetype ? [...archetype.quirks] : surfaceQuirks(norm, form);
  if (archetype) addSurfaceMood(norm, quirks);

  // Layer 3. Wilds names are invented, and curated archetypes and numbers have their own design.
  const word = source === 'chat' && !archetype && norm.number === null ? lookupWord(norm.root, norm.letters) : null;
  const meaning: Meaning | null = word
    ? { lemma: word.lemma, pos: word.pos[0], axes: word.axes, rare: word.zipf <= 2 && word.lemma.length >= 5 }
    : null;
  if (meaning) addMeaningQuirks(meaning, quirks);

  let swarm = form.swarm;
  if (norm.number !== null && !archetype) {
    // Plain numbers become a squad of numerals, one per digit.
    swarm = clamp(norm.number.length, 2, 6);
    if (!quirks.includes('cyber')) quirks.push('cyber');
  }

  const elite = archetype?.elite ?? ((meaning?.rare || (form.letterValue >= 4.2 && form.length >= 3)) && swarm === 1);
  const weights = archetype?.weights ? jitter(archetype.weights, rng, 0.02) : formWeights(form, norm, meaning, rng);
  const element = word?.element ?? null;

  return {
    key,
    token: norm.raw.length > 20 ? norm.raw.slice(0, 19) + '…' : norm.raw,
    root: norm.root,
    source,
    seed,
    rarity: elite ? 'elite' : 'common',
    formClass,
    form,
    casing: norm.casing,
    punctuation: norm.punctuation,
    quirks: dedupe(quirks),
    weights,
    look: makeLook(form, source, elite, archetype, swarm, meaning, element, rng),
    swarm,
    archetype: archetype?.title ?? null,
    emote,
    meaning,
    element,
    family: word && meaning?.pos === 'n' ? word.family : null,
  };
}

/** A Wilds monster: an invented name run through the same pipeline, plus a seeded quirk now and then. */
export function makeWildGenome(rng: Rng): Genome {
  for (let attempt = 0; attempt < 8; attempt++) {
    const genome = makeGenome(wildName(rng), { source: 'wilds' });
    if (!genome) continue;
    const quirkRng = mulberry32(genome.seed ^ 0x9e3779b9);
    if (quirkRng() < 0.3) genome.quirks = dedupe([...genome.quirks, pick(quirkRng, WILD_QUIRKS)]);
    // Wilds have no meaning, but most still carry an element so offline play teaches the counters.
    // They stay far less saturated than chat monsters so they never pass for chat.
    if (quirkRng() < 0.6) {
      const element = pick(quirkRng, ELEMENTS);
      genome.element = element;
      genome.look = { ...genome.look, hue: (ELEMENT_HUE[element] + 360 + Math.round((quirkRng() - 0.5) * 20)) % 360, saturation: 0.28 };
    }
    return genome;
  }
  // Practically unreachable, but the Wilds must always produce something.
  return makeGenome('Grubbok', { source: 'wilds' })!;
}

const WILD_QUIRKS: readonly Quirk[] = ['charge', 'confused', 'drowsy', 'enraged', 'shielded'];

function speciesKey(source: MonsterSource, norm: NormalizedToken, emote: EmoteRef | null): string {
  const identity = emote ? `${emote.provider}#${emote.id}` : norm.number ?? norm.root;
  const archetype = CURATED_EMOTES[norm.raw.replace(/[!?.]+$/, '')] ? norm.raw.replace(/[!?.]+$/, '') : '';
  return [source, identity, archetype || norm.casing, norm.punctuation ?? '', norm.leet ? 'leet' : ''].join('|');
}

function surfaceQuirks(norm: NormalizedToken, form: FormGenes): Quirk[] {
  const quirks: Quirk[] = [];
  if (norm.casing === 'caps') quirks.push('enraged');
  if (norm.casing === 'alternating') quirks.push('mocking');
  if (form.palindrome) quirks.push('mirror');
  if (norm.leet) quirks.push('cyber');
  addSurfaceMood(norm, quirks);
  return quirks;
}

/** Readability cap: surface quirks come first because chat chose them on purpose. */
const MAX_QUIRKS = 3;

/** Strong meanings become behaviors. Only the strongest two axes can add one. */
function addMeaningQuirks(meaning: Meaning, quirks: Quirk[]): void {
  const a = meaning.axes;
  const candidates: [number, Quirk][] = [];
  if (a.life >= 2) candidates.push([a.life, 'regen']);
  if (a.life <= -2) candidates.push([-a.life, 'undying']);
  if (a.presence <= -2) candidates.push([-a.presence, 'stealth']);
  if (a.presence >= 3) candidates.push([a.presence, 'mocking']);
  if (a.mood >= 3) candidates.push([a.mood, 'enraged']);
  if (a.order >= 3) candidates.push([a.order, 'confused']);
  candidates.sort((x, y) => y[0] - x[0]);
  for (const [, quirk] of candidates.slice(0, 2)) {
    if (quirks.length >= MAX_QUIRKS) break;
    if (!quirks.includes(quirk)) quirks.push(quirk);
  }
}

function addSurfaceMood(norm: NormalizedToken, quirks: Quirk[]): void {
  if (norm.punctuation) quirks.push(norm.punctuation);
}

function formWeights(form: FormGenes, norm: NormalizedToken, meaning: Meaning | null, rng: Rng): StatWeights {
  const s = form.sharpness;
  const len = form.length;
  const stretch = Math.min(norm.stretch, 6);
  const raw: StatWeights = {
    // Spiky and short means fast. Round, long, and stretched means tanky.
    speed: 0.34 + 0.22 * s - 0.02 * (len - 5) - 0.04 * stretch,
    hp: 0.34 - 0.18 * s + 0.03 * (len - 5) + 0.03 * form.syllables + 0.05 * stretch,
    armor: 0.18 + 0.06 * form.clusters + 0.03 * (form.letterValue - 2),
  };
  if (meaning) {
    // Meaning outranks sound: a full-strength axis moves a stat more than the sharpest spelling.
    const a = meaning.axes;
    raw.speed += 0.1 * a.speed;
    raw.hp += 0.08 * a.mass + 0.02 * Math.max(0, a.life);
    raw.armor += 0.08 * a.hardness;
  }
  return jitter(raw, rng, 0.04);
}

function jitter(w: StatWeights, rng: Rng, amount: number): StatWeights {
  const hp = Math.max(0.05, w.hp + (rng() - 0.5) * 2 * amount);
  const speed = Math.max(0.05, w.speed + (rng() - 0.5) * 2 * amount);
  const armor = Math.max(0.05, w.armor + (rng() - 0.5) * 2 * amount);
  const total = hp + speed + armor;
  return { hp: hp / total, speed: speed / total, armor: armor / total };
}

function makeLook(
  form: FormGenes,
  source: MonsterSource,
  elite: boolean,
  archetype: Archetype | undefined,
  swarm: number,
  meaning: Meaning | null,
  element: Element | null,
  rng: Rng,
): Look {
  const unitLength = swarm > 1 ? Math.max(1, (form.swarmUnit ?? 'x').length) : form.length;
  const massScale = meaning ? 1 + 0.09 * meaning.axes.mass : 1;
  const scale = (archetype?.scale ?? 1) * (elite ? 1.15 : 1) * (swarm > 1 ? 0.7 : 1) * massScale;
  const randomHue = Math.floor(rng() * 360);
  return {
    hue: element ? (ELEMENT_HUE[element] + Math.round((rng() - 0.5) * 24) + 360) % 360 : randomHue,
    saturation: source === 'wilds' ? 0.18 : element === 'stone' ? 0.3 : 0.72,
    lightness: source === 'wilds' ? 0.5 : 0.58,
    radius: (13 + clamp(unitLength, 1, 12) * 0.9) * scale,
    segments: clamp(form.syllables - 1, 0, 3),
    eyes: clamp(form.vowels, 1, 4),
    horns: clamp(form.clusters, 0, 3),
    points: 5 + Math.floor(rng() * 4),
    phase: rng() * Math.PI * 2,
  };
}

/** Element sets the body color so the counter reads at a glance. */
export const ELEMENT_HUE: Record<Element, number> = {
  fire: 12, frost: 195, storm: 52, venom: 105, stone: 30, spirit: 275,
};

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
