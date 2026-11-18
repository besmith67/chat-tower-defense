import { describe, expect, it } from 'vitest';
import { lexiconSize, lookupWord } from '../src/genome/lexicon';
import { decodeEntry, encodeEntry, neutralAxes } from '../src/genome/lexiconFormat';

describe('lexicon format', () => {
  it('round-trips an entry', () => {
    const axes = { ...neutralAxes(), speed: -2, hardness: 3 };
    const decoded = decodeEntry(encodeEntry(['n', 'v'], 'beast', 'venom', 3, axes));
    expect(decoded).toEqual({ pos: ['n', 'v'], family: 'beast', element: 'venom', zipf: 3, axes });
  });

  it('omits neutral axes', () => {
    expect(encodeEntry(['a'], null, null, 4, neutralAxes())).toBe('a.-.-.4');
  });
});

describe('lookupWord', () => {
  it('ships a sizable vocabulary', () => {
    expect(lexiconSize()).toBeGreaterThan(20000);
  });

  it('finds families from WordNet', () => {
    expect(lookupWord('wolf')?.family).toBe('beast');
    expect(lookupWord('truck')?.family).toBe('construct');
    expect(lookupWord('pizza')?.family).toBe('food');
    expect(lookupWord('eye')?.family).toBe('body');
    expect(lookupWord('mountain')?.family).toBe('place');
  });

  it('picks the dominant part of speech', () => {
    expect(lookupWord('pizza')?.pos[0]).toBe('n');
    expect(lookupWord('angry')?.pos[0]).toBe('a');
  });

  it('undoes common inflections', () => {
    expect(lookupWord('foxes')).toMatchObject({ lemma: 'fox', inflection: 'plural' });
    expect(lookupWord('wolves')?.lemma).toBe('wolf');
    expect(lookupWord('mice')?.lemma).toBe('mouse');
    expect(lookupWord('digging')?.lemma).toBe('dig');
    expect(lookupWord('explodes')?.lemma).toBe('explode');
  });

  it('keeps double letters when stretched letters collapse', () => {
    expect(lookupWord('slep', 'sleeeep')?.lemma).toBe('sleep');
  });

  it('knows nothing about invented words', () => {
    expect(lookupWord('vorlag')).toBeNull();
    expect(lookupWord('grubbok')).toBeNull();
  });

  it('gives verbs no body plan', () => {
    expect(lookupWord('dig')?.pos[0]).toBe('v');
    expect(lookupWord('dig')?.family).toBeNull();
  });

  it('never marks seeded slang as rare', () => {
    expect(lookupWord('pog')!.zipf).toBeGreaterThanOrEqual(4);
  });

  it('spreads seed meanings to synonyms and neighbors', () => {
    expect(lookupWord('inferno')!.element).toBe('fire');
    expect(lookupWord('scooter')!.axes.speed).toBeGreaterThan(0);
    expect(lookupWord('puppies')!.axes.mood).toBeLessThan(0);
  });

  it('matches the worked examples', () => {
    const snail = lookupWord('snail')!;
    const rocket = lookupWord('rocket')!;
    expect(snail.axes.speed).toBeLessThan(0);
    expect(snail.axes.hardness).toBeGreaterThan(0);
    expect(rocket.axes.speed).toBeGreaterThan(0);
    expect(rocket.element).toBe('fire');
    expect(lookupWord('ghost')).toMatchObject({ element: 'spirit' });
    expect(lookupWord('ghost')!.axes.life).toBeLessThan(0);
    const avalanche = lookupWord('avalanche')!;
    expect(avalanche.element).toBe('frost');
    expect(avalanche.axes.mass).toBeGreaterThan(1);
    expect(avalanche.axes.order).toBeGreaterThan(1);
  });

  it('reads meaning from the seeds', () => {
    expect(lookupWord('slow')!.axes.speed).toBeLessThan(0);
    expect(lookupWord('hot')!.element).toBe('fire');
  });
});
