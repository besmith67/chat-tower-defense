/**
 * Element matchups. Each element resists one damage kind and is weak to one, so a streamer can learn
 * the whole table in a few waves. See docs/DESIGN.md, Towers and counters.
 */
import type { Element } from '../genome/lexiconFormat';
import type { DamageKind } from './towers';

export const ELEMENT_MATCHUPS: Record<Element, { resists: DamageKind; weakTo: DamageKind }> = {
  fire: { resists: 'fire', weakTo: 'cold' },
  frost: { resists: 'cold', weakTo: 'fire' },
  storm: { resists: 'shock', weakTo: 'pierce' },
  venom: { resists: 'blunt', weakTo: 'fire' },
  stone: { resists: 'pierce', weakTo: 'shock' },
  spirit: { resists: 'blunt', weakTo: 'shock' },
};

export const ELEMENT_WEAK = 1.4;
export const ELEMENT_RESIST = 0.7;

/** Damage multiplier from the target's element. Neutral monsters take normal damage. */
export function elementMultiplier(kind: DamageKind, element: Element | null): number {
  if (!element) return 1;
  const m = ELEMENT_MATCHUPS[element];
  if (m.weakTo === kind) return ELEMENT_WEAK;
  if (m.resists === kind) return ELEMENT_RESIST;
  return 1;
}
