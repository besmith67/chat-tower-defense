import { describe, expect, it } from 'vitest';
import { makeGenome, type Genome } from '../src/genome';
import { weaknessText } from '../src/genome/describe';
import { ELEMENTS } from '../src/genome/lexiconFormat';
import type { SpawnOrder } from '../src/sim/collector';
import { ELEMENT_MATCHUPS, ELEMENT_RESIST, ELEMENT_WEAK, elementMultiplier } from '../src/sim/elements';
import { TOWERS } from '../src/sim/towers';
import { World } from '../src/sim/world';

function order(token: string, power = 1): SpawnOrder {
  const genome = makeGenome(token) as Genome;
  return { genome, power, scale: 1, cost: 10, copies: 1, sender: 'tester' };
}

describe('element matchups', () => {
  it('gives every element exactly one resistance and one weakness, never the same', () => {
    for (const el of ELEMENTS) {
      const m = ELEMENT_MATCHUPS[el];
      expect(m.resists).not.toBe(m.weakTo);
    }
  });

  it('has a tower for every damage kind the table uses', () => {
    const kinds = new Set(Object.values(TOWERS).map((t) => t.kind));
    for (const el of ELEMENTS) {
      expect(kinds.has(ELEMENT_MATCHUPS[el].resists)).toBe(true);
      expect(kinds.has(ELEMENT_MATCHUPS[el].weakTo)).toBe(true);
    }
  });

  it('applies the multiplier', () => {
    expect(elementMultiplier('cold', 'fire')).toBe(ELEMENT_WEAK);
    expect(elementMultiplier('fire', 'fire')).toBe(ELEMENT_RESIST);
    expect(ELEMENT_WEAK).toBeGreaterThan(1);
    expect(ELEMENT_RESIST).toBeLessThan(1);
    expect(elementMultiplier('fire', null)).toBe(1);
  });

  it('explains counters from shape and element together', () => {
    expect(weaknessText(makeGenome('rocket')!)).toBe('Weak to Hammer and Frost, resists Needle and Flame.');
    expect(weaknessText(makeGenome('zaly')!)).toMatch(/^No weakness|^Weak to|^Resists/);
  });
});

describe('elemental towers', () => {
  function firstDamage(towerId: 'flame' | 'tesla' | 'needle', token: string): number {
    const world = new World(1000, 20);
    world.placeTower(towerId, 2, 3);
    const m = world.spawn(order(token, 5), 'chat', 60);
    const before = m.hp;
    for (let t = 0; t < 1.2; t += 1 / 60) world.step(1 / 60);
    return before - m.hp;
  }

  it('burns: flame damage keeps landing between shots', () => {
    const world = new World(1000, 20);
    world.placeTower('flame', 2, 3);
    const m = world.spawn(order('pizza', 5), 'chat', 60);
    for (let t = 0; t < 0.3; t += 1 / 60) world.step(1 / 60);
    expect(m.burnUntil).toBeGreaterThan(world.time);
    expect(m.burnBy).not.toBeNull();
  });

  it('hurts frost monsters more with flame than fire monsters', () => {
    expect(firstDamage('flame', 'snow')).toBeGreaterThan(firstDamage('flame', 'lava'));
  });

  it('chains tesla lightning to nearby monsters', () => {
    const world = new World(1000, 20);
    world.placeTower('tesla', 2, 3);
    const a = world.spawn(order('rock', 5), 'chat', 60);
    const b = world.spawn(order('rock', 5), 'chat', 40);
    const c = world.spawn(order('rock', 5), 'chat', 20);
    let chains = 0;
    for (let t = 0; t < 0.2; t += 1 / 60) {
      world.step(1 / 60);
      chains += world.drainEvents().filter((e) => e.type === 'chain').length;
    }
    expect(chains).toBeGreaterThanOrEqual(2);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(a.hp).toBeLessThan(a.maxHp);
  });
});
