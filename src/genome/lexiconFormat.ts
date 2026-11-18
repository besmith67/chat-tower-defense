/**
 * Shared vocabulary for the meaning layer. Used by the offline lexicon builder (tools/lexicon)
 * and by the runtime lookup (lexicon.ts), so both agree on the compact encoding.
 */

export type Pos = 'n' | 'v' | 'a' | 'r';

export const FAMILIES = [
  'beast', 'construct', 'food', 'person', 'body', 'place', 'elemental', 'abstract', 'sound', 'meme',
] as const;
export type Family = (typeof FAMILIES)[number];

export const ELEMENTS = ['fire', 'frost', 'storm', 'venom', 'stone', 'spirit'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Eight semantic axes, each an integer from -3 to +3. See docs/MONSTER_GENERATION.md, Layer 3. */
export const AXES = ['speed', 'mass', 'hardness', 'heat', 'life', 'mood', 'order', 'presence'] as const;
export type Axis = (typeof AXES)[number];
export type Axes = Record<Axis, number>;

/** Two-letter codes used in data/lexicon/seeds.tsv. */
export const AXIS_CODES: Record<string, Axis> = {
  sp: 'speed', ma: 'mass', ha: 'hardness', he: 'heat', li: 'life', mo: 'mood', or: 'order', pr: 'presence',
};

export const FAMILY_CODE: Record<Family, string> = {
  beast: 'b', construct: 'c', food: 'f', person: 'p', body: 'y', place: 'l', elemental: 'e', abstract: 'a', sound: 's', meme: 'm',
};
export const ELEMENT_CODE: Record<Element, string> = {
  fire: 'f', frost: 'i', storm: 's', venom: 'v', stone: 'r', spirit: 'g',
};

export function neutralAxes(): Axes {
  return { speed: 0, mass: 0, hardness: 0, heat: 0, life: 0, mood: 0, order: 0, presence: 0 };
}

/**
 * One entry is a short string: parts of speech (dominant first), family code or "-", element code or "-",
 * a frequency digit, and optionally eight axis digits where 3 means neutral.
 * Example: "nv.b.-.3.15533323".
 */
export function encodeEntry(pos: Pos[], family: Family | null, element: Element | null, zipf: number, axes: Axes): string {
  const parts = [pos.join(''), family ? FAMILY_CODE[family] : '-', element ? ELEMENT_CODE[element] : '-', String(zipf)];
  const digits = AXES.map((a) => String(Math.max(-3, Math.min(3, Math.round(axes[a]))) + 3)).join('');
  if (digits !== '33333333') parts.push(digits);
  return parts.join('.');
}

const FAMILY_BY_CODE = Object.fromEntries(Object.entries(FAMILY_CODE).map(([k, v]) => [v, k])) as Record<string, Family>;
const ELEMENT_BY_CODE = Object.fromEntries(Object.entries(ELEMENT_CODE).map(([k, v]) => [v, k])) as Record<string, Element>;

export interface DecodedEntry {
  pos: Pos[];
  family: Family | null;
  element: Element | null;
  /** Rough Zipf frequency, 1 (rare) to 7 (very common). */
  zipf: number;
  axes: Axes;
}

export function decodeEntry(entry: string): DecodedEntry {
  const [pos, family, element, zipf, digits] = entry.split('.');
  const axes = neutralAxes();
  if (digits) AXES.forEach((a, i) => (axes[a] = Number(digits[i]) - 3));
  return {
    pos: pos.split('') as Pos[],
    family: FAMILY_BY_CODE[family] ?? null,
    element: ELEMENT_BY_CODE[element] ?? null,
    zipf: Number(zipf),
    axes,
  };
}
