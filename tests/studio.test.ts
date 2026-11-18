import { describe, expect, it } from 'vitest';
import { makeGenome } from '../src/genome';
import { SpawnCollector } from '../src/sim/collector';
import { applyStudio, loadStudio, saveStudio } from '../src/sim/studio';

const emote = { provider: '7tv' as const, id: 'e1', url: '' };

describe('Emote Studio', () => {
  it('renames and adds a signature ability first', () => {
    const g = applyStudio(makeGenome('pokiHype', { emote })!, { e1: { name: 'Hype Train', ability: 'burrow' } })!;
    expect(g.token).toBe('Hype Train');
    expect(g.quirks[0]).toBe('burrow');
  });

  it('disables an emote so it spawns nothing', () => {
    expect(applyStudio(makeGenome('pokiHype', { emote })!, { e1: { disabled: true } })).toBeNull();
    const collector = new SpawnCollector();
    collector.setStudio({ e1: { disabled: true } });
    const message = {
      id: 'm', platform: 'local' as const, userId: 'u', userName: 'u', text: 'pokiHype', at: 0,
      emotes: [{ ...emote, name: 'pokiHype' }],
    };
    expect(collector.addMessage(message)).toBe(0);
  });

  it('leaves words and other emotes alone', () => {
    const snail = makeGenome('snail')!;
    expect(applyStudio(snail, { e1: { disabled: true } })).toBe(snail);
  });

  it('saves per channel and drops empty entries', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveStudio('MyChannel', { e1: { boss: true }, e2: {} }, storage);
    expect(loadStudio('mychannel', storage)).toEqual({ e1: { boss: true } });
    expect(loadStudio('other', storage)).toEqual({});
  });
});
