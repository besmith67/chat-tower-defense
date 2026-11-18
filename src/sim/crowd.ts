/**
 * Layer 7, the crowd: what the rest of chat sends in the same window changes the result.
 * Synonyms fuse into one colossus that carries every name: all their copies merge into a single titan. Opposites clash and cancel out,
 * so part of chat can sabotage the rest of chat.
 */
import type { Genome } from '../genome';
import { AXES } from '../genome/lexiconFormat';
import type { PendingSpecies } from './collector';

export type CrowdEvent =
  | { type: 'fusion'; tokens: string[]; into: string }
  | { type: 'clash'; a: string; b: string; cancelled: number }
  | { type: 'rhyme'; tokens: string[] }
  | { type: 'alliteration'; tokens: string[] };

/** Minimum meaning strength (vector length) for a word to fuse or clash. Weak meanings never do. */
const MIN_STRENGTH = 2;
const FUSE_AT = 0.92;
const CLASH_AT = -0.8;

function vector(g: Genome): number[] | null {
  if (!g.meaning) return null;
  const v = AXES.map((a) => g.meaning!.axes[a]);
  return Math.hypot(...v) >= MIN_STRENGTH ? v : null;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (Math.hypot(...a) * Math.hypot(...b));
}

function sameElement(a: Genome, b: Genome): boolean {
  return !a.element || !b.element || a.element === b.element;
}

/**
 * Resolves fusions, then clashes, in place on the pending map. Returns what happened, for the HUD.
 * Only chat species with a meaning take part; emotes with curated designs and the Wilds never do.
 */
export function resolveCrowd(species: Map<string, PendingSpecies>): CrowdEvent[] {
  const events: CrowdEvent[] = [];
  const list = [...species.values()].filter((p) => p.genome.source === 'chat' && vector(p.genome));

  // Fusion: group close synonyms with a different dictionary word.
  const used = new Set<PendingSpecies>();
  for (const host of [...list].sort((a, b) => b.contributions.length - a.contributions.length)) {
    if (used.has(host)) continue;
    const hv = vector(host.genome)!;
    const group = list.filter(
      (p) =>
        p !== host &&
        !used.has(p) &&
        p.genome.meaning!.lemma !== host.genome.meaning!.lemma &&
        sameElement(p.genome, host.genome) &&
        cosine(hv, vector(p.genome)!) >= FUSE_AT,
    );
    if (!group.length) continue;
    used.add(host);
    const tokens = [host.genome.token, ...group.map((p) => p.genome.token)];
    for (const p of group) {
      used.add(p);
      host.contributions.push(...p.contributions);
      species.delete(p.genome.key);
    }
    const name = tokens.join('+');
    host.genome = {
      ...host.genome,
      token: name.length > 20 ? name.slice(0, 19) + '…' : name,
      fusion: tokens,
      look: { ...host.genome.look, radius: host.genome.look.radius * 1.15 },
    };
    events.push({ type: 'fusion', tokens, into: host.genome.token });
  }

  // Clash: opposites cancel copy for copy. The bigger side survives with what is left.
  const alive = [...species.values()].filter((p) => p.genome.source === 'chat' && vector(p.genome));
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      if (!species.has(a.genome.key) || !species.has(b.genome.key)) continue;
      if (cosine(vector(a.genome)!, vector(b.genome)!) > CLASH_AT) continue;
      const cancelled = Math.min(a.contributions.length, b.contributions.length);
      a.contributions.splice(a.contributions.length - cancelled, cancelled);
      b.contributions.splice(b.contributions.length - cancelled, cancelled);
      if (!a.contributions.length) species.delete(a.genome.key);
      if (!b.contributions.length) species.delete(b.genome.key);
      events.push({ type: 'clash', a: a.genome.token, b: b.genome.token, cancelled });
    }
  }
  return events;
}

/** The rime: from the last vowel group to the end. "cat" and "hat" share "at". */
export function rhymeKey(root: string): string | null {
  const m = /[aeiouy]+[^aeiouy]*$/.exec(root);
  if (!m || m[0].length < 2 || root.length < 3 || m[0] === root) return null;
  return m[0];
}

/** The opening consonant sound: "sn" in snail and snake, "b" in big and bear. Vowel starts do not count. */
export function onsetKey(root: string): string | null {
  if (root.length < 3) return null;
  const m = /^[^aeiouy]+/.exec(root);
  return m ? m[0] : null;
}

const MIN_PATTERN = 3;

/**
 * Rhymes and alliteration among different chat words in the same window. Three or more rhyming
 * words form a conga line that walks together, each shielded. Three or more words with the same
 * first sound form a pack that speeds each other up. Each species joins at most one pattern.
 */
export function resolvePatterns(species: Map<string, PendingSpecies>): CrowdEvent[] {
  const events: CrowdEvent[] = [];
  const chat = [...species.values()].filter((p) => p.genome.source === 'chat' && !p.genome.emoji && !p.genome.fusion);
  const taken = new Set<PendingSpecies>();

  const groups = (keyOf: (root: string) => string | null) => {
    const map = new Map<string, PendingSpecies[]>();
    for (const p of chat) {
      if (taken.has(p)) continue;
      const key = keyOf(p.genome.root);
      if (!key) continue;
      const list = map.get(key) ?? [];
      if (!list.some((q) => q.genome.root === p.genome.root)) list.push(p);
      map.set(key, list);
    }
    // Only the biggest pattern of each kind per wave, so the effect stays an event, not the norm.
    const best = [...map.entries()].filter(([, list]) => list.length >= MIN_PATTERN).sort((a, b) => b[1].length - a[1].length)[0];
    return best ? [best] : [];
  };

  for (const [key, list] of groups(rhymeKey)) {
    for (const p of list) {
      taken.add(p);
      p.genome = withQuirk({ ...p.genome, link: `rhyme:${key}` }, 'shielded');
    }
    events.push({ type: 'rhyme', tokens: list.map((p) => p.genome.token) });
  }
  for (const [key, list] of groups(onsetKey)) {
    for (const p of list) {
      taken.add(p);
      p.genome = withQuirk({ ...p.genome, link: `pack:${key}` }, 'hype');
    }
    events.push({ type: 'alliteration', tokens: list.map((p) => p.genome.token) });
  }
  return events;
}

function withQuirk(g: Genome, quirk: Genome['quirks'][number]): Genome {
  return g.quirks.includes(quirk) ? g : { ...g, quirks: [quirk, ...g.quirks].slice(0, 3) };
}

/** Pulls linked monsters (a rhyme chain or a pack) together in the spawn order, so they walk as a line. */
export function groupLinked<T extends { genome: Genome }>(orders: T[]): T[] {
  const out: T[] = [];
  const placed = new Set<T>();
  for (const o of orders) {
    if (placed.has(o)) continue;
    const link = o.genome.link;
    const members = link ? orders.filter((x) => x.genome.link === link) : [o];
    for (const m of members) {
      placed.add(m);
      out.push(m);
    }
  }
  return out;
}
