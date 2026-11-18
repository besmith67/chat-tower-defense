import { describe, expect, it } from 'vitest';
import { EmoteDirectory, parse7tvSet, parseBttv, parseFfz } from '../src/chat/emoteDirectory';
import { extractTokens } from '../src/sim/collector';

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
