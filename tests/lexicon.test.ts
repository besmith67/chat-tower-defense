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
    expect(lookupWord('wolves')).toBeNull(); // irregular plurals are not handled yet
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

  it('reads meaning from the seeds', () => {
    expect(lookupWord('slow')!.axes.speed).toBeLessThan(0);
    expect(lookupWord('hot')!.element).toBe('fire');
  });
});
