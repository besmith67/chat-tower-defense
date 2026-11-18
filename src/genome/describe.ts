/** Human-readable explanations of genes, shared by the inspect panel and docs. */
import type { Genome, Quirk } from './types';

export const QUIRK_INFO: Record<Quirk, { label: string; detail: string }> = {
  enraged: { label: 'Enraged', detail: 'Faster as it loses health. From ALL CAPS.' },
  mocking: { label: 'Mocking', detail: 'Towers must shoot it first. From aLtErNaTiNg case.' },
  charge: { label: 'Charge', detail: 'Bursts of speed. From a trailing "!".' },
  confused: { label: 'Confused', detail: 'Erratic speed. From a trailing "?".' },
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
};

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
