/** Human-readable explanations of genes, shared by the inspect panel and docs. */
import type { Axis, Element } from './lexiconFormat';
import type { Genome, Quirk } from './types';

export const QUIRK_INFO: Record<Quirk, { label: string; detail: string }> = {
  enraged: { label: 'Enraged', detail: 'Faster as it loses health. From ALL CAPS or a hostile word.' },
  mocking: { label: 'Mocking', detail: 'Towers must shoot it first. From aLtErNaTiNg case or a loud word.' },
  charge: { label: 'Charge', detail: 'Bursts of speed. From a trailing "!".' },
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
  if (genome.family) parts.push(genome.family[0].toUpperCase() + genome.family.slice(1));
  else parts.push(m.pos === 'v' ? 'Verb' : m.pos === 'a' ? 'Adjective' : 'Word');
  if (strongest.length) parts.push(`means ${strongest.join(', ')}`);
  if (m.lemma !== genome.root) parts.push(`from "${m.lemma}"`);
  if (m.rare) parts.push('rare word');
  return parts.join(' · ');
}

export function weaknessText(genome: Genome): string {
  const parts: string[] = [];
  if (genome.formClass === 'round') parts.push('Weak to Needle, resists Hammer');
  else if (genome.formClass === 'spiky') parts.push('Weak to Hammer, resists Needle');
  else parts.push('No shape weakness');
  if (genome.swarm > 1) parts.push('Hammer splash shreds swarms');
  return parts.join('. ') + '.';
}

export function formText(genome: Genome): string {
  const shape = genome.formClass === 'balanced' ? 'Balanced' : genome.formClass === 'round' ? 'Round' : 'Spiky';
  const bits = [shape, `${genome.form.syllables} syl`, `${genome.form.vowels} vowels`];
  if (genome.rarity === 'elite') bits.push('Elite letters');
  if (genome.swarm > 1) bits.push(`Swarm ×${genome.swarm}`);
  return bits.join(' · ');
}
