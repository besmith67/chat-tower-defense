import { describe, expect, it, vi } from 'vitest';
import { EmoteDirectory, parse7tvSet, parseBttv, parseFfz } from '../src/chat/emoteDirectory';
import { extractTokens } from '../src/sim/collector';
import { makeGenome } from '../src/genome';

describe('emote parsers', () => {
  it('parses 7TV sets and zero-width flags', () => {
    const emotes = parse7tvSet({ emotes: [{ id: 'a1', name: 'KEKW', flags: 0 }, { id: 'b2', name: 'RainTime', flags: 1 }] });
    expect(emotes[0]).toMatchObject({ provider: '7tv', name: 'KEKW', url: 'https://cdn.7tv.app/emote/a1/2x.webp', zeroWidth: false });
    expect(emotes[1].zeroWidth).toBe(true);
    expect(parse7tvSet(null)).toEqual([]);
  });

  it('parses BTTV global arrays and channel objects', () => {
    expect(parseBttv([{ id: 'x', code: 'catJAM' }])[0].name).toBe('catJAM');
    expect(parseBttv({ channelEmotes: [{ id: 'y', code: 'a' }], sharedEmotes: [{ id: 'z', code: 'b' }] })).toHaveLength(2);
  });

  it('parses FFZ sets, fixes protocol-relative urls, and skips hidden emotes', () => {
    const emotes = parseFfz({
      sets: { '3': { emoticons: [{ id: 1, name: 'LilZ', urls: { '1': '//cdn.ffz/1' } }, { id: 2, name: 'Hidden', hidden: true, urls: { '1': 'u' } }] } },
    });
    expect(emotes).toEqual([{ provider: 'ffz', id: '1', name: 'LilZ', url: 'https://cdn.ffz/1' }]);
  });
});

describe('EmoteDirectory.enrich', () => {
  it('tags third-party emotes inside messages so the collector treats them as emotes', () => {
    const dir = new EmoteDirectory();
    (dir as any).global.set('Sadge', { provider: '7tv', id: 's1', name: 'Sadge', url: 'u' });
    const msg = dir.enrich({ id: '1', platform: 'twitch', userId: 'u', userName: 'u', text: 'we lost again Sadge', emotes: [], at: 0 });
    expect(msg.emotes.map((e) => e.name)).toEqual(['Sadge']);
    expect(extractTokens(msg)[0]).toMatchObject({ text: 'Sadge', emote: { id: 's1' } });
  });
});

describe('EmoteDirectory loading', () => {
  it('applies each provider as it answers, even if another one hangs', async () => {
    const seventv = { emotes: [{ id: 'abc', name: 'catJAM', flags: 0 }] };
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('frankerfacez')) return new Promise(() => {}); // never answers
      if (url.includes('7tv.io')) return Promise.resolve({ ok: true, json: () => Promise.resolve(seventv) });
      return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    });
    const dir = new EmoteDirectory();
    void dir.loadGlobal();
    await new Promise((r) => setTimeout(r, 10));
    expect(dir.lookup('catJAM')?.provider).toBe('7tv');
    vi.unstubAllGlobals();
  });
});

describe('zero-width emotes', () => {
  const msg = (text: string, emotes: { name: string; zeroWidth?: boolean }[]) => ({
    id: '1', platform: 'local' as const, userId: 'u', userName: 'u', text, at: 0,
    emotes: emotes.map((e) => ({ provider: '7tv' as const, id: e.name, name: e.name, url: '', zeroWidth: e.zeroWidth ?? false })),
  });

  it('layers a zero-width emote onto the emote before it', () => {
    const tokens = extractTokens(msg('KEKW RainTime', [{ name: 'KEKW' }, { name: 'RainTime', zeroWidth: true }]));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].text).toBe('KEKW');
    expect(tokens[0].overlay?.name).toBe('RainTime');
  });

  it('spawns a lone zero-width emote as itself', () => {
    const tokens = extractTokens(msg('RainTime', [{ name: 'RainTime', zeroWidth: true }]));
    expect(tokens[0].text).toBe('RainTime');
  });

  it('makes a layered monster a distinct, rarer species', () => {
    const emote = { provider: '7tv' as const, id: 'p1', url: '' };
    const overlay = { provider: '7tv' as const, id: 'z1', url: '', name: 'RainTime' };
    const plain = makeGenome('pokiHype', { emote })!;
    const layered = makeGenome('pokiHype', { emote, overlay })!;
    expect(layered.key).not.toBe(plain.key);
    expect(layered.rarity).toBe('elite');
    expect(layered.overlay?.id).toBe('z1');
    expect(layered.element).toBe('storm'); // "rain" reads as storm
  });
});
