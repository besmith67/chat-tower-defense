import type { FormClass } from '../genome';

export type TowerId = 'needle' | 'hammer' | 'frost';
export type DamageKind = 'pierce' | 'blunt' | 'frost';

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
    hotkey: '2',
    color: 0xf8961e,
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    blurb: 'Pulses slow on everything in range. Ignores armor.',
    cost: 65,
    range: 85,
    cooldown: 1.6,
    damage: 3,
    kind: 'frost',
    slow: 0.45,
    slowSeconds: 1.4,
    hotkey: '3',
    color: 0x90e0ef,
  },
};

export const TOWER_ORDER: TowerId[] = ['needle', 'hammer', 'frost'];

/** Damage multiplier from the target's body shape. Above 1 is super effective. */
export function formMultiplier(kind: DamageKind, form: FormClass): number {
  if (kind === 'pierce') return form === 'round' ? 1.4 : form === 'spiky' ? 0.7 : 1;
  if (kind === 'blunt') return form === 'spiky' ? 1.4 : form === 'round' ? 0.7 : 1;
  return 1;
}

/** How much of the target's armor applies. */
export function armorFactor(kind: DamageKind): number {
  return kind === 'pierce' ? 0.5 : kind === 'frost' ? 0 : 1;
}
