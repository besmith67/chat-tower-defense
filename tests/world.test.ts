import { describe, expect, it } from 'vitest';
import { makeGenome, type Genome } from '../src/genome';
import type { SpawnOrder } from '../src/sim/collector';
import { World } from '../src/sim/world';

function order(token: string, power = 1): SpawnOrder {
  const genome = makeGenome(token) as Genome;
  return { genome, power, scale: 1, cost: 10, copies: 1, sender: 'tester' };
}

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) world.step(1 / 60);
}

describe('World', () => {
  it('lets an undefended monster walk the path and cost lives', () => {
    const world = new World(0, 20);
    world.queueWave([order('snail')], 1);
    run(world, 120);
    expect(world.lives).toBe(19);
    expect(world.waveDone).toBe(true);
  });

  it('refuses towers on the path, on other towers, or without gold', () => {
    const world = new World(1000, 20);
    expect(world.placeTower('needle', 2, 2)).toBeNull();
    expect(world.placeTower('needle', 2, 3)).not.toBeNull();
    expect(world.placeTower('hammer', 2, 3)).toBeNull();
    const broke = new World(10, 20);
    expect(broke.placeTower('needle', 2, 3)).toBeNull();
  });

  it('kills monsters with towers, pays bounty, and teaches towers the species', () => {
    const world = new World(1000, 20);
    world.placeTower('needle', 3, 3);
    world.placeTower('needle', 5, 3);
    world.placeTower('hammer', 3, 1);
    const goldBefore = world.gold;
    world.queueWave([order('snail'), order('snail')], 1);
    run(world, 60);
    expect(world.lives).toBe(20);
    expect(world.gold).toBeGreaterThan(goldBefore);
    const kills = world.towers.reduce((sum, t) => sum + (t.kills.get(makeGenome('snail')!.key) ?? 0), 0);
    expect(kills).toBe(2);
  });

  it('makes piercing super effective on round monsters and weak on spiky ones', () => {
    const world = new World(1000, 20);
    world.placeTower('needle', 3, 3);
    world.queueWave([order('bloomo'), order('kitkit')], 1);
    const effects: Record<string, string> = {};
    for (let i = 0; i < 60 * 30; i++) {
      world.step(1 / 60);
      for (const e of world.drainEvents()) if (e.type === 'hit') effects[e.monster.genome.root] = e.effect;
    }
    expect(effects['bloomo']).toBe('strong');
    expect(effects['kitkit']).toBe('weak');
  });

  it('splits LUL into three minis when it dies', () => {
    const world = new World(1000, 20);
    world.placeTower('hammer', 3, 3);
    world.queueWave([order('LUL', 0.2)], 1);
    let spawns = 0;
    for (let i = 0; i < 60 * 30; i++) {
      world.step(1 / 60);
      spawns += world.drainEvents().filter((e) => e.type === 'spawn').length;
    }
    expect(spawns).toBe(4);
  });

  it('pops the EZ shield on the first hit', () => {
    const world = new World(1000, 20);
    world.placeTower('needle', 3, 3);
    world.queueWave([order('EZ')], 1);
    const types: string[] = [];
    for (let i = 0; i < 60 * 20; i++) {
      world.step(1 / 60);
      types.push(...world.drainEvents().map((e) => e.type));
    }
    expect(types.filter((t) => t === 'shield')).toHaveLength(1);
    expect(types.indexOf('shield')).toBeLessThan(types.indexOf('hit'));
  });
});
