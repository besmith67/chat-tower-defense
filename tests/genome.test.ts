import { describe, expect, it } from 'vitest';
import { makeGenome, makeWildGenome, mulberry32 } from '../src/genome';
import { readForm } from '../src/genome/form';
import { normalizeToken } from '../src/genome/normalize';

describe('normalizeToken', () => {
  it('collapses stretched letters and remembers the stretch', () => {
    const n = normalizeToken('noooooo')!;
    expect(n.root).toBe('no');
    expect(n.stretch).toBe(5);
  });

  it('undoes leetspeak', () => {
    const n = normalizeToken('h4x0r')!;
    expect(n.root).toBe('haxor');
    expect(n.leet).toBe(true);
  });

  it('reads casing patterns', () => {
    expect(normalizeToken('NOOO')!.casing).toBe('caps');
    expect(normalizeToken('sNaIlS')!.casing).toBe('alternating');
    expect(normalizeToken('Snail')!.casing).toBe('title');
    expect(normalizeToken('PogChamp')!.casing).toBe('mixed');
  });

  it('reads trailing punctuation as a mood', () => {
    expect(normalizeToken('go!!!')!.punctuation).toBe('charge');
    expect(normalizeToken('what?!')!.punctuation).toBe('confused');
    expect(normalizeToken('sleep...')!.punctuation).toBe('drowsy');
    expect(normalizeToken('ok.')!.punctuation).toBeNull();
  });

  it('rejects tokens with no letters or digits', () => {
    expect(normalizeToken('!!!')).toBeNull();
    expect(normalizeToken('   ')).toBeNull();
  });
});

describe('readForm', () => {
  it('reads round sounds as round and sharp sounds as spiky', () => {
    expect(readForm('bloom').sharpness).toBeLessThan(-0.25);
    expect(readForm('kitty').sharpness).toBeGreaterThan(0.25);
  });

  it('detects repeated chunks as a swarm', () => {
    expect(readForm('ha', 'hahahaha')).toMatchObject({ swarm: 4, swarmUnit: 'ha' });
    expect(readForm('z', 'zzzzz')).toMatchObject({ swarm: 5, swarmUnit: 'z' });
    expect(readForm('no', 'noooo').swarm).toBe(1);
  });

  it('counts syllables and spots palindromes', () => {
    expect(readForm('banana').syllables).toBe(3);
    expect(readForm('racecar').palindrome).toBe(true);
    expect(readForm('snail').palindrome).toBe(false);
  });
});

describe('makeGenome', () => {
  it('is deterministic', () => {
    expect(makeGenome('snail')).toEqual(makeGenome('snail'));
  });

  it('gives different species to different words', () => {
    expect(makeGenome('snail')!.key).not.toBe(makeGenome('rocket')!.key);
  });

  it('turns surface signals into quirks', () => {
    expect(makeGenome('SNAIL')!.quirks).toContain('enraged');
    expect(makeGenome('sNaIlS')!.quirks).toContain('mocking');
    expect(makeGenome('racecar')!.quirks).toContain('mirror');
    expect(makeGenome('h4x0r')!.quirks).toContain('cyber');
    expect(makeGenome('snail?')!.quirks).toContain('confused');
  });

  it('makes round words tankier and spiky words faster', () => {
    const round = makeGenome('bloomo')!;
    const spiky = makeGenome('kitkit')!;
    expect(round.formClass).toBe('round');
    expect(spiky.formClass).toBe('spiky');
    expect(round.weights.hp).toBeGreaterThan(spiky.weights.hp);
    expect(spiky.weights.speed).toBeGreaterThan(round.weights.speed);
  });

  it('keeps stat weights normalized', () => {
    for (const word of ['a', 'snail', 'antidisestablishmentarianism', 'ZZZZZ', 'h4x0r']) {
      const w = makeGenome(word)!.weights;
      expect(w.hp + w.speed + w.armor).toBeCloseTo(1, 5);
    }
  });

  it('makes high Scrabble-value words elite', () => {
    expect(makeGenome('jazz')!.rarity).toBe('elite');
    expect(makeGenome('snail')!.rarity).toBe('common');
  });

  it('applies curated emote archetypes case-sensitively', () => {
    expect(makeGenome('KEKW')!.archetype).toBe('Cackler');
    expect(makeGenome('KEKW')!.quirks).toContain('stunburst');
    expect(makeGenome('kekw')!.archetype).toBeNull();
  });

  it('turns repeated chunks into swarms', () => {
    expect(makeGenome('hahahaha')!.swarm).toBe(4);
  });

  it('handles meme numbers and plain numbers', () => {
    expect(makeGenome('420')!.archetype).toBe('Haze');
    const plain = makeGenome('12345')!;
    expect(plain.swarm).toBe(5);
    expect(plain.quirks).toContain('cyber');
  });

  it('never spawns blocked words', () => {
    expect(makeGenome('fuuuuck')).toBeNull();
    expect(makeGenome('sh1t')).toBeNull();
  });

  it('keys emotes by provider and id', () => {
    const a = makeGenome('pokiHype', { emote: { provider: 'twitch', id: '123', url: 'x' } })!;
    const b = makeGenome('pokiHype')!;
    expect(a.key).not.toBe(b.key);
    expect(a.emote?.id).toBe('123');
  });
});

describe('makeWildGenome', () => {
  it('produces Title Case invented creatures marked as wilds', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const g = makeWildGenome(rng);
      expect(g.source).toBe('wilds');
      expect(g.token[0]).toBe(g.token[0].toUpperCase());
      expect(g.look.saturation).toBeLessThan(0.3);
    }
  });
});
