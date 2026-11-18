import type { FormClass } from '../genome';

export type TowerId = 'needle' | 'hammer' | 'frost' | 'flame' | 'tesla';
export type DamageKind = 'pierce' | 'blunt' | 'cold' | 'fire' | 'shock';

export interface TowerDef {
  id: TowerId;
  name: string;
  blurb: string;
  cost: number;
  range: number;
  /** Seconds between shots. */
  cooldown: number;
  damage: number;
  kind: DamageKind;
  /** Blunt towers hit everything within this radius of the target. */
  splash?: number;
  /** Frost towers slow by this fraction. */
  slow?: number;
  slowSeconds?: number;
  /** Fire towers set targets burning: damage per second, ignoring armor. */
  burnDps?: number;
  burnSeconds?: number;
  /** Shock towers jump to this many extra targets within chainRange, losing chainFalloff each jump. */
  chains?: number;
  chainRange?: number;
  chainFalloff?: number;
  /** Short label for the build button. */
  role: string;
  hotkey: string;
  color: number;
}

export const TOWERS: Record<TowerId, TowerDef> = {
  needle: {
    id: 'needle',
    name: 'Needle',
    blurb: 'Fast piercing shots. Strong vs round, weak vs spiky. Half armor.',
    cost: 50,
    range: 115,
    cooldown: 0.4,
    damage: 7,
    kind: 'pierce',
    role: 'pierce',
    hotkey: '1',
    color: 0x4cc9f0,
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    blurb: 'Slow blunt splash. Strong vs spiky and swarms, weak vs round.',
    cost: 75,
    range: 95,
    cooldown: 1.3,
    damage: 20,
    kind: 'blunt',
    splash: 48,
    role: 'splash',
    hotkey: '2',
    color: 0xf8961e,
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    blurb: 'Pulses cold that slows everything in range. Ignores armor. Strong vs Fire.',
    cost: 65,
    range: 85,
    cooldown: 1.6,
    damage: 7,
    kind: 'cold',
    slow: 0.45,
    slowSeconds: 1.4,
    role: 'slow',
    hotkey: '3',
    color: 0x90e0ef,
  },
  flame: {
    id: 'flame',
    name: 'Flame',
    blurb: 'Short-range fire that leaves targets burning. Burn ignores armor. Strong vs Frost and Venom.',
    cost: 70,
    range: 90,
    cooldown: 0.45,
    damage: 5,
    kind: 'fire',
    burnDps: 10,
    burnSeconds: 2.5,
    role: 'burn',
    hotkey: '4',
    color: 0xff6b35,
  },
  tesla: {
    id: 'tesla',
    name: 'Tesla',
    blurb: 'Lightning that chains to three more monsters. Strong vs Stone and Spirit.',
    cost: 85,
    range: 105,
    cooldown: 0.9,
    damage: 16,
    kind: 'shock',
    chains: 3,
    chainRange: 75,
    chainFalloff: 0.8,
    role: 'chain',
    hotkey: '5',
    color: 0xffe066,
  },
};

export const TOWER_ORDER: TowerId[] = ['needle', 'hammer', 'frost', 'flame', 'tesla'];

/** Damage multiplier from the target's body shape. Above 1 is super effective. */
export function formMultiplier(kind: DamageKind, form: FormClass): number {
  if (kind === 'pierce') return form === 'round' ? 1.4 : form === 'spiky' ? 0.7 : 1;
  if (kind === 'blunt') return form === 'spiky' ? 1.4 : form === 'round' ? 0.7 : 1;
  return 1;
}

/** How much of the target's armor applies. */
export function armorFactor(kind: DamageKind): number {
  return kind === 'pierce' ? 0.5 : kind === 'cold' ? 0 : 1;
}
