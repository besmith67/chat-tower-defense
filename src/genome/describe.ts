/** Human-readable explanations of genes, shared by the inspect panel and docs. */
import type { Axis, Element, Family } from './lexiconFormat';
import type { Genome, Quirk } from './types';

export const QUIRK_INFO: Record<Quirk, { label: string; detail: string }> = {
  enraged: { label: 'Enraged', detail: 'Faster as it loses health. From ALL CAPS or a hostile word.' },
  mocking: { label: 'Mocking', detail: 'Towers must shoot it first. From aLtErNaTiNg case or a loud word.' },
  charge: { label: 'Charge', detail: 'Bursts of speed. From a trailing "!" or a running verb.' },
  confused: { label: 'Confused', detail: 'Erratic speed. From a trailing "?" or a chaotic word.' },
  drowsy: { label: 'Drowsy', detail: 'Slow, but towers spot it late. From "...".' },
  mirror: { label: 'Mirror', detail: 'Reflects some hits. From a palindrome.' },
  cyber: { label: 'Cyber', detail: 'Extra armor. From l33tspeak or numbers.' },
  stunburst: { label: 'Stunburst', detail: 'Stuns the nearest tower when it dies.' },
  splitter: { label: 'Splitter', detail: 'Splits into three when it dies.' },
  hype: { label: 'Hype', detail: 'Speeds up nearby monsters.' },
  panic: { label: 'Panic', detail: 'Sprints after every hit.' },
  cope: { label: 'Cope', detail: 'Heals after big hits.' },
  gloom: { label: 'Gloom', detail: 'Slows the fire rate of nearby towers.' },
  shielded: { label: 'Shielded', detail: 'Ignores the first hit.' },
  blink: { label: 'Blink', detail: 'Teleports forward every few seconds.' },
  rhythm: { label: 'Rhythm', detail: 'Moves in bursts on the beat.' },
  regen: { label: 'Regen', detail: 'Heals over time. From a living word.' },
  undying: { label: 'Undying', detail: 'Gets back up once. From an undead word.' },
  stealth: { label: 'Stealth', detail: 'Towers spot it late. From a hidden word.' },
  hop: { label: 'Hop', detail: 'Leaps ahead every few seconds. From a jumping verb.' },
  burrow: { label: 'Burrow', detail: 'Dives underground, untargetable for a moment. From a digging verb.' },
  healer: { label: 'Healer', detail: 'Heals monsters around it. From a healing verb.' },
  thief: { label: 'Thief', detail: 'Steals gold if it reaches the base. From a stealing verb.' },
  herald: { label: 'Herald', detail: 'Aura that passes its meaning to monsters around it. From an adjective.' },
};

/** Every family has a body plan and one small trait. Beasts are the plain baseline. */
export const FAMILY_INFO: Record<Family, { label: string; trait: string }> = {
  beast: { label: 'Beast', trait: 'A plain creature on legs. No special trait.' },
  construct: { label: 'Construct', trait: 'Armored plating on wheels.' },
  food: { label: 'Food', trait: 'Leaves a snack when it dies that heals nearby monsters.' },
  person: { label: 'Person', trait: 'Sometimes dodges Needle and Flame shots.' },
  body: { label: 'Body part', trait: 'Floats, so Frost cannot slow it.' },
  place: { label: 'Place', trait: 'Walking terrain: tougher but slower.' },
  elemental: { label: 'Elemental', trait: 'Pure element: weaknesses and resistances hit twice as hard. Little armor.' },
  abstract: { label: 'Spirit', trait: 'Resists physical damage from Needle and Hammer.' },
  sound: { label: 'Sound', trait: 'Shouts every few seconds, stunning nearby towers briefly.' },
  meme: { label: 'Meme', trait: 'Goes viral: sometimes leaves a copy when it dies.' },
};

export const ELEMENT_INFO: Record<Element, { label: string; icon: string }> = {
  fire: { label: 'Fire', icon: '🔥' },
  frost: { label: 'Frost', icon: '❄' },
  storm: { label: 'Storm', icon: '⚡' },
  venom: { label: 'Venom', icon: '☣' },
  stone: { label: 'Stone', icon: '⛰' },
  spirit: { label: 'Spirit', icon: '✦' },
};

const AXIS_WORDS: Record<Axis, [string, string]> = {
  speed: ['slow', 'fast'],
  mass: ['tiny', 'huge'],
  hardness: ['soft', 'hard'],
  heat: ['cold', 'hot'],
  life: ['undead', 'alive'],
  mood: ['friendly', 'hostile'],
  order: ['orderly', 'chaotic'],
  presence: ['hidden', 'loud'],
};

const AFFIX_TEXT: Record<string, string> = {
  mega: 'mega', mini: 'a pack of mini', un: 'the opposite of', est: 'the most', re: 'returning',
};

/** "Fire · Beast · means fast, hostile", or null for a token with no meaning. */
export function meaningText(genome: Genome): string | null {
  const m = genome.meaning;
  if (!m) return null;
  const strongest = (Object.entries(m.axes) as [Axis, number][])
    .filter(([, v]) => Math.abs(v) >= 2)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([axis, v]) => AXIS_WORDS[axis][v > 0 ? 1 : 0]);
  const parts: string[] = [];
  if (genome.element) parts.push(`${ELEMENT_INFO[genome.element].icon} ${ELEMENT_INFO[genome.element].label}`);
  if (genome.family) parts.push(FAMILY_INFO[genome.family].label);
  else parts.push(m.pos === 'v' ? 'Verb' : m.pos === 'a' ? 'Adjective' : 'Word');
  if (strongest.length) parts.push(`means ${strongest.join(', ')}`);
  if (m.emoteSuffix) parts.push(`emote ending "${m.emoteSuffix}" reads as "${m.lemma}"`);
  else if (m.typoOf) parts.push(`typo of "${m.typoOf}", mutant`);
  else if (m.affix) parts.push(`${AFFIX_TEXT[m.affix] ?? m.affix} "${m.lemma}"`);
  else if (m.lemma !== genome.root) parts.push(`from "${m.lemma}"`);
  if (m.rare) parts.push('rare word');
  return parts.join(' · ');
}

/** Which tower deals each damage kind, for player-facing text. */
const KIND_TOWER: Record<string, string> = { pierce: 'Needle', blunt: 'Hammer', cold: 'Frost', fire: 'Flame', shock: 'Tesla' };

/** Element matchups, mirrored from src/sim/elements.ts so the generator stays free of sim imports. */
const ELEMENT_COUNTERS: Record<Element, { weakTo: string; resists: string }> = {
  fire: { weakTo: 'cold', resists: 'fire' },
  frost: { weakTo: 'fire', resists: 'cold' },
  storm: { weakTo: 'pierce', resists: 'shock' },
  venom: { weakTo: 'fire', resists: 'blunt' },
  stone: { weakTo: 'shock', resists: 'pierce' },
  spirit: { weakTo: 'shock', resists: 'blunt' },
};

export function weaknessText(genome: Genome): string {
  const weak: string[] = [];
  const resist: string[] = [];
  if (genome.formClass === 'round') { weak.push('Needle'); resist.push('Hammer'); }
  if (genome.formClass === 'spiky') { weak.push('Hammer'); resist.push('Needle'); }
  if (genome.element) {
    const c = ELEMENT_COUNTERS[genome.element];
    const w = KIND_TOWER[c.weakTo];
    const r = KIND_TOWER[c.resists];
    if (!weak.includes(w)) weak.push(w);
    if (!resist.includes(r)) resist.push(r);
  }
  // A tower that is both strong (shape) and weak (element) roughly cancels out; show neither.
  const both = weak.filter((t) => resist.includes(t));
  const parts: string[] = [];
  const w = weak.filter((t) => !both.includes(t));
  const r = resist.filter((t) => !both.includes(t));
  if (w.length) parts.push(`Weak to ${w.join(' and ')}`);
  if (r.length) parts.push(`resists ${r.join(' and ')}`);
  if (!parts.length) parts.push('No weakness');
  if (genome.swarm > 1) parts.push('Hammer splash shreds swarms');
  const sentence = parts.join(', ');
  return sentence[0].toUpperCase() + sentence.slice(1) + '.';
}

export function formText(genome: Genome): string {
  const shape = genome.formClass === 'balanced' ? 'Balanced' : genome.formClass === 'round' ? 'Round' : 'Spiky';
  const bits = [shape, `${genome.form.syllables} syl`, `${genome.form.vowels} vowels`];
  if (genome.rarity === 'elite') bits.push('Elite letters');
  if (genome.swarm > 1) bits.push(`Swarm ×${genome.swarm}`);
  return bits.join(' · ');
}
