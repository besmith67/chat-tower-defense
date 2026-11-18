import { describe, expect, it } from 'vitest';
import { makeGenome } from '../src/genome';
import { meaningText } from '../src/genome/describe';
import { splitEmoteName } from '../src/genome/emoteName';

const emote = { provider: 'twitch' as const, id: '1', url: '' };

describe('emote names', () => {
  it('splits channel prefixes from suffixes', () => {
    expect(splitEmoteName('pokiHype')).toEqual({ prefix: 'poki', suffix: 'Hype' });
    expect(splitEmoteName('xqcL')).toEqual({ prefix: 'xqc', suffix: 'L' });
    expect(splitEmoteName('PepeLaugh')).toEqual({ prefix: 'Pepe', suffix: 'Laugh' });
    expect(splitEmoteName('KEKW')).toBeNull();
    expect(splitEmoteName('snail')).toBeNull();
  });

  it('reads the suffix through the word pipeline', () => {
    const hype = makeGenome('pokiHype', { emote })!;
    expect(hype.meaning).toMatchObject({ lemma: 'hype', emoteSuffix: 'Hype' });
    expect(hype.element).toBe('storm');
    expect(meaningText(hype)).toContain('emote ending "Hype"');
  });

  it('reads emote slang the way chat means it: L is love', () => {
    expect(makeGenome('xqcL', { emote })!.meaning?.lemma).toBe('love');
  });

  it('borrows a body plan from a noun prefix', () => {
    const g = makeGenome('catWait', { emote })!;
    expect(g.family).toBe('beast');
    expect(g.meaning?.lemma).toBe('wait');
  });

  it('keeps real words whole and curated emotes curated', () => {
    expect(makeGenome('Pizza')!.meaning?.emoteSuffix).toBeNull();
    expect(makeGenome('KEKW', { emote })!.meaning).toBeNull();
  });

  it('gives the same species every time', () => {
    expect(makeGenome('pokiHype', { emote })!.key).toBe(makeGenome('pokiHype', { emote })!.key);
  });
});

describe('emoji', () => {
  it('reads an emoji as its word but keeps its own species', () => {
    const fire = makeGenome('🔥')!;
    expect(fire.emoji).toBe('🔥');
    expect(fire.token).toBe('🔥');
    expect(fire.element).toBe('fire');
    expect(fire.meaning?.lemma).toBe('fire');
    expect(fire.key).not.toBe(makeGenome('fire')!.key);
  });

  it('uses chat meanings for chat emoji', () => {
    expect(makeGenome('😂')!.meaning?.lemma).toBe('laugh');
    expect(makeGenome('💀')!.meaning?.lemma).toBe('skull');
    expect(makeGenome('🐌')!.meaning?.lemma).toBe('snail');
  });

  it('turns a run of the same emoji into a swarm', () => {
    expect(makeGenome('🔥🔥🔥🔥')!.swarm).toBe(4);
    expect(makeGenome('🔥')!.swarm).toBe(1);
  });

  it('ignores mixed emoji runs and unknown symbols', () => {
    expect(makeGenome('🔥🐌')).toBeNull();
  });
});
