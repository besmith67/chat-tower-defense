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
  | { type: 'clash'; a: string; b: string; cancelled: number };

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
