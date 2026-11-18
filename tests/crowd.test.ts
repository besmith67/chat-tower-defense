import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/genome';
import { SpawnCollector } from '../src/sim/collector';

function wave(words: string[]) {
  const c = new SpawnCollector(99);
  words.forEach((w, i) => c.addMessage({ id: String(i), platform: 'local', userId: `u${i}`, userName: `u${i}`, text: w, emotes: [], at: i }));
  return c.takeWave(5000, 'chat-only', mulberry32(1));
}

describe('crowd layer', () => {
  it('fuses synonyms into one colossus carrying every name', () => {
    const plan = wave(['big', 'huge', 'giant']);
    expect(plan.crowd).toEqual([expect.objectContaining({ type: 'fusion', tokens: expect.arrayContaining(['big', 'huge', 'giant']) })]);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0].genome.fusion).toHaveLength(3);
    expect(plan.orders[0].copies).toBe(3);
  });

  it('cancels opposites copy for copy', () => {
    const plan = wave(['hot', 'hot', 'hot', 'cold']);
    expect(plan.crowd).toEqual([{ type: 'clash', a: 'hot', b: 'cold', cancelled: 1 }]);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0].genome.token).toBe('hot');
    expect(plan.orders[0].copies).toBe(2);
  });

  it('leaves unrelated words, weak meanings, and repeats of one word alone', () => {
    expect(wave(['snail', 'rocket', 'ghost', 'zombie']).crowd).toEqual([]);
    expect(wave(['ghost', 'ghost', 'ghost']).crowd).toEqual([]);
  });

  it('never touches the Wilds or offline play', () => {
    const c = new SpawnCollector(99);
    ['hot', 'cold'].forEach((w, i) => c.addMessage({ id: String(i), platform: 'local', userId: `u${i}`, userName: 'x', text: w, emotes: [], at: i }));
    expect(c.takeWave(500, 'offline', mulberry32(1)).crowd).toEqual([]);
  });
});

describe('rhymes and alliteration', () => {
  it('links three rhyming words into a shielded chain that spawns together', () => {
    const plan = wave(['cat', 'ghost', 'hat', 'pizza', 'bat']);
    expect(plan.crowd).toContainEqual({ type: 'rhyme', tokens: ['cat', 'hat', 'bat'] });
    const chain = plan.orders.filter((o) => o.genome.link?.startsWith('rhyme'));
    expect(chain).toHaveLength(3);
    for (const o of chain) expect(o.genome.quirks).toContain('shielded');
    const at = plan.orders.findIndex((o) => o.genome.link?.startsWith('rhyme'));
    expect(plan.orders.slice(at, at + 3).every((o) => o.genome.link?.startsWith('rhyme'))).toBe(true);
  });

  it('packs three words with the same opening sound', () => {
    const plan = wave(['snail', 'sneak', 'snake']);
    expect(plan.crowd).toContainEqual({ type: 'alliteration', tokens: ['snail', 'sneak', 'snake'] });
    expect(plan.orders.every((o) => o.genome.quirks.includes('hype'))).toBe(true);
  });

  it('needs three different words', () => {
    expect(wave(['cat', 'cat', 'hat']).crowd).toEqual([]);
  });
});
