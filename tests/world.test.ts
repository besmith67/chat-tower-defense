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

describe('meaning quirks in the sim', () => {
  it('regenerates living monsters', () => {
    const world = new World(0, 20);
    world.queueWave([order('tree')], 1);
    run(world, 1);
    const m = world.monsters[0];
    expect(m.genome.quirks).toContain('regen');
    m.hp = m.maxHp / 2;
    run(world, 2);
    expect(m.hp).toBeGreaterThan(m.maxHp / 2);
  });

  it('brings undying monsters back once', () => {
    const world = new World(1000, 20);
    world.placeTower('hammer', 5, 3);
    world.queueWave([order('zombie', 0.2)], 1);
    const events: string[] = [];
    for (let t = 0; t < 120 && !world.waveDone; t += 1 / 60) {
      world.step(1 / 60);
      for (const e of world.drainEvents()) events.push(e.type);
    }
    expect(events).toContain('revive');
    expect(events.filter((e) => e === 'revive').length).toBe(1);
  });

  it('makes titans slower than a single copy', () => {
    const world = new World(0, 20);
    const single = world.spawn(order('snail'), 'chat', 0);
    const titan = world.spawn({ ...order('snail'), scale: 2 }, 'chat', 0);
    expect(titan.speed).toBeLessThan(single.speed);
  });
});

describe('family traits', () => {
  function events(world: World, seconds: number): string[] {
    const out: string[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      world.step(1 / 60);
      for (const e of world.drainEvents()) out.push(e.type);
    }
    return out;
  }

  it('reads families from the lexicon', () => {
    expect(makeGenome('truck')!.family).toBe('construct');
    expect(makeGenome('pizza')!.family).toBe('food');
    expect(makeGenome('boom')!.family).toBe('sound');
    expect(makeGenome('pog')!.family).toBe('meme');
  });

  it('plates constructs with extra armor', () => {
    const world = new World(0, 20);
    const truck = world.spawn(order('truck'), 'chat', 0);
    const plain = { ...order('truck'), genome: { ...makeGenome('truck')!, family: null } };
    expect(truck.armor).toBeGreaterThan(world.spawn(plain, 'chat', 0).armor);
  });

  it('heals neighbors when food dies', () => {
    const world = new World(1000, 20);
    world.placeTower('hammer', 2, 3);
    const friend = world.spawn(order('snail', 5), 'chat', 50);
    friend.hp = friend.maxHp / 2;
    world.spawn(order('pizza', 0.1), 'chat', 55);
    expect(events(world, 2)).toContain('snack');
  });

  it('lets floating body parts ignore Frost slows', () => {
    const world = new World(1000, 20);
    world.placeTower('frost', 2, 3);
    const eye = world.spawn(order('eye', 5), 'chat', 60);
    events(world, 2);
    expect(eye.slowFactor).toBe(0);
  });

  it('makes sound monsters shout and stun nearby towers', () => {
    const world = new World(1000, 20);
    world.placeTower('needle', 2, 3);
    world.spawn(order('boom', 20), 'chat', 60);
    expect(events(world, 5)).toContain('shout');
  });
});

describe('verbs and adjectives', () => {
  const g = (t: string) => makeGenome(t)!;

  it('turns verbs into abilities', () => {
    expect(g('dig').quirks).toContain('burrow');
    expect(g('heal').quirks).toContain('healer');
    expect(g('steal').quirks).toContain('thief');
    expect(g('jump').quirks).toContain('hop');
    expect(g('sprint').quirks).toContain('charge');
    expect(g('explode').quirks).toContain('stunburst');
    expect(g('sneak').quirks).toContain('stealth');
    expect(g('split').quirks).toContain('splitter');
    expect(g('digging').quirks).toContain('burrow');
  });

  it('turns adjectives into heralds and keeps nouns plain', () => {
    expect(g('angry').quirks).toContain('herald');
    expect(g('snail').quirks).not.toContain('herald');
  });

  it('hides burrowers from towers part of the time', () => {
    const world = new World(1000, 20);
    world.placeTower('needle', 2, 3);
    const mole = world.spawn(order('dig', 50), 'chat', 60);
    let burrowedTime = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      world.step(1 / 60);
      if (world.isBurrowed(mole)) burrowedTime += 1 / 60;
    }
    expect(burrowedTime).toBeGreaterThan(1);
    expect(burrowedTime).toBeLessThan(2);
  });

  it('lets thieves steal gold when they leak', () => {
    const world = new World(500, 20);
    world.queueWave([order('steal')], 1);
    const stolen: number[] = [];
    for (let t = 0; t < 120 && !world.waveDone; t += 1 / 60) {
      world.step(1 / 60);
      for (const e of world.drainEvents()) if (e.type === 'steal') stolen.push(e.amount);
    }
    expect(stolen.length).toBe(1);
    expect(world.gold).toBe(500 - stolen[0]);
  });

  it('lets a fast herald speed up its neighbors', () => {
    const world = new World(0, 20);
    const alone = world.spawn(order('snail'), 'chat', 0);
    const start = alone.dist;
    for (let t = 0; t < 1; t += 1 / 60) world.step(1 / 60);
    const soloDistance = alone.dist - start;

    const world2 = new World(0, 20);
    const buffed = world2.spawn(order('snail'), 'chat', 0);
    world2.spawn(order('fast', 50), 'chat', 0);
    for (let t = 0; t < 1; t += 1 / 60) world2.step(1 / 60);
    expect(buffed.dist).toBeGreaterThan(soloDistance);
  });

  it('heals neighbors around a healer', () => {
    const world = new World(0, 20);
    const hurt = world.spawn(order('snail'), 'chat', 0);
    world.spawn(order('heal'), 'chat', 0);
    hurt.hp = hurt.maxHp / 2;
    for (let t = 0; t < 1; t += 1 / 60) world.step(1 / 60);
    expect(hurt.hp).toBeGreaterThan(hurt.maxHp / 2);
  });
});

describe('tower upgrades', () => {
  it('raises damage and range per level, with a perk at level 3', () => {
    const world = new World(1000, 20);
    const tesla = world.placeTower('tesla', 2, 3)!;
    const base = { damage: tesla.def.damage, range: tesla.def.range, chains: tesla.def.chains! };
    expect(world.upgradeTower(tesla)).toBe(true);
    expect(tesla.level).toBe(2);
    expect(tesla.def.damage).toBeGreaterThan(base.damage);
    expect(tesla.def.range).toBeGreaterThan(base.range);
    expect(world.upgradeTower(tesla)).toBe(true);
    expect(tesla.def.chains).toBe(base.chains + 2);
    expect(world.upgradeTower(tesla)).toBe(false);
  });

  it('charges gold and refunds part of everything spent', () => {
    const world = new World(200, 20);
    const needle = world.placeTower('needle', 2, 3)!;
    const before = world.gold;
    world.upgradeTower(needle);
    expect(world.gold).toBeLessThan(before);
    expect(needle.spent).toBeGreaterThan(50);
    const broke = new World(50, 20);
    expect(broke.upgradeTower(broke.placeTower('needle', 2, 3)!)).toBe(false);
  });

  it('never changes the shared tower definitions', () => {
    const world = new World(1000, 20);
    const needle = world.placeTower('needle', 2, 3)!;
    world.upgradeTower(needle);
    expect(world.placeTower('needle', 3, 3)!.def.damage).toBe(7);
  });
});

describe('maps', () => {
  it('builds every map with connected roads that end at the base', async () => {
    const { MAPS, createMap } = await import('../src/sim/map');
    for (const def of MAPS) {
      const map = createMap(def);
      for (const portal of ['chat', 'wilds'] as const) {
        const end = map.paths[portal].pointAt(map.paths[portal].length);
        expect(Math.hypot(end.x - map.base.x, end.y - map.base.y)).toBeLessThan(1);
        expect(map.paths[portal].length).toBeGreaterThan(800);
      }
      expect(def.chat[def.chat.length - 1]).toEqual(def.shared[0]);
      expect(def.wilds[def.wilds.length - 1]).toEqual(def.shared[0]);
    }
  });

  it('lets an undefended monster reach the base on every map', async () => {
    const { MAPS } = await import('../src/sim/map');
    for (const def of MAPS) {
      const world = new World(0, 20, def.id);
      world.queueWave([order('snail')], 1);
      run(world, 200);
      expect(world.lives).toBe(19);
    }
  });
});
