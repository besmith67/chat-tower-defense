import { describe, expect, it } from 'vitest';
import { makeGenome } from '../src/genome';
import { Bestiary } from '../src/sim/bestiary';
import type { SpawnOrder } from '../src/sim/collector';
import { EVOLVE_AT, Match } from '../src/sim/match';

const order = (token: string, sender: string, copies = 1): SpawnOrder => ({ genome: makeGenome(token)!, power: 1, scale: 1, cost: 10, copies, sender });

describe('bestiary', () => {
  it('credits the first viewer and counts later copies', () => {
    const b = new Bestiary();
    expect(b.record([order('ghost', 'amy', 2)], '2026-11-18')).toEqual([{ token: 'ghost', by: 'amy' }]);
    expect(b.record([order('ghost', 'bob', 3)], '2026-11-19')).toEqual([]);
    const entry = Object.values(b.entries)[0];
    expect(entry).toMatchObject({ token: 'ghost', discoveredBy: 'amy', discoveredAt: '2026-11-18', sent: 5 });
  });

  it('ignores the Wilds and free split-offs', () => {
    const b = new Bestiary();
    const wild = { ...order('ghost', 'x'), genome: makeGenome('Vorlag', { source: 'wilds' })! };
    const mini = { ...order('snail', 'x'), cost: 0 };
    expect(b.record([wild, mini], 'd')).toEqual([]);
  });

  it('saves and loads per channel', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const b = new Bestiary();
    b.record([order('ghost', 'amy')], 'd');
    b.save('Chan', storage);
    expect(Bestiary.load('chan', storage).size).toBe(1);
    expect(Bestiary.load('other', storage).size).toBe(0);
  });
});

describe('evolution', () => {
  it('turns a species that leaked often into its Prime form', () => {
    const match = new Match({ mode: 'chat-only', seed: 1 });
    const key = makeGenome('ghost')!.key;
    match.world.leaksBySpecies.set(key, EVOLVE_AT);
    match.handleChat({ type: 'message', message: { id: '1', platform: 'local', userId: 'u', userName: 'u', text: 'ghost', emotes: [], at: 0 } });
    match.startWave();
    const ghost = match.lastPlan!.orders.find((o) => o.genome.key === key)!;
    expect(ghost.genome.token).toBe('ghost Prime');
    expect(ghost.genome.rarity).toBe('elite');
    expect(match.evolutions).toEqual(['ghost']);
  });
});
