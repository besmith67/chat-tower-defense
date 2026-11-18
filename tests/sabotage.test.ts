import { describe, expect, it } from 'vitest';
import { makeGenome, type Genome } from '../src/genome';
import type { SpawnOrder } from '../src/sim/collector';
import { sabotageTarget } from '../src/sim/sabotage';
import { World } from '../src/sim/world';

const order = (token: string, power = 1): SpawnOrder => ({ genome: makeGenome(token) as Genome, power, scale: 1, cost: 10, copies: 1, sender: 't' });

describe('tower sabotage', () => {
  it('maps counter words to the tower they jam', () => {
    expect(sabotageTarget(makeGenome('water')!)).toBe('flame');
    expect(sabotageTarget(makeGenome('ground')!)).toBe('tesla');
    expect(sabotageTarget(makeGenome('pillow')!)).toBe('hammer');
    expect(sabotageTarget(makeGenome('snail')!)).toBeNull();
    expect(sabotageTarget(makeGenome('water', { source: 'wilds' })!)).toBeNull();
  });

  it('jams only the matching tower type as it passes', () => {
    const world = new World(1000, 20);
    const flame = world.placeTower('flame', 2, 3)!;
    const needle = world.placeTower('needle', 3, 3)!;
    world.spawn(order('water', 50), 'chat', 40);
    let jams = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      world.step(1 / 60);
      jams += world.drainEvents().filter((e) => e.type === 'jam').length;
    }
    expect(jams).toBeGreaterThan(0);
    expect(flame.stunnedUntil).toBeGreaterThan(0);
    expect(needle.stunnedUntil).toBe(0);
  });
});
