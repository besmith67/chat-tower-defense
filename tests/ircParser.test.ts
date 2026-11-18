import { describe, expect, it } from 'vitest';
import { ircToChatEvent, parseEmotesTag, parseIrcLine } from '../src/chat/ircParser';

describe('parseIrcLine', () => {
  it('parses a tagged PRIVMSG', () => {
    const line = parseIrcLine(
      '@badge-info=;display-name=Snail\\sFan;emotes=25:0-4;id=abc-123;tmi-sent-ts=1700000000000;user-id=42 :snailfan!snailfan@snailfan.tmi.twitch.tv PRIVMSG #streamer :Kappa hello',
    )!;
    expect(line.command).toBe('PRIVMSG');
    expect(line.params).toEqual(['#streamer']);
    expect(line.trailing).toBe('Kappa hello');
    expect(line.tags['display-name']).toBe('Snail Fan');

    const event = ircToChatEvent(line);
    expect(event).toMatchObject({
      type: 'message',
      message: { id: 'abc-123', userId: '42', userName: 'Snail Fan', text: 'Kappa hello' },
    });
    if (event?.type === 'message') expect(event.message.emotes[0]).toMatchObject({ id: '25', name: 'Kappa' });
  });

  it('parses PING without tags or prefix', () => {
    expect(parseIrcLine('PING :tmi.twitch.tv')).toMatchObject({ command: 'PING', trailing: 'tmi.twitch.tv' });
  });

  it('turns CLEARMSG into a delete and CLEARCHAT into a purge', () => {
    expect(ircToChatEvent(parseIrcLine('@login=foo;target-msg-id=m1 :tmi.twitch.tv CLEARMSG #chan :bad')!)).toEqual({
      type: 'delete',
      messageId: 'm1',
    });
    expect(ircToChatEvent(parseIrcLine('@ban-duration=600;target-user-id=99 :tmi.twitch.tv CLEARCHAT #chan :foo')!)).toEqual({
      type: 'purge',
      userId: '99',
    });
    expect(ircToChatEvent(parseIrcLine(':tmi.twitch.tv CLEARCHAT #chan')!)).toEqual({ type: 'purge', userId: null });
  });
});

describe('parseEmotesTag', () => {
  it('uses code point positions so emoji before an emote do not shift it', () => {
    // "🔥" is one code point but two UTF-16 units, so Kappa starts at code point 2.
    expect(parseEmotesTag('25:2-6', '🔥 Kappa')[0].name).toBe('Kappa');
  });

  it('dedupes repeated emotes', () => {
    expect(parseEmotesTag('25:0-4,6-10', 'Kappa Kappa')).toHaveLength(1);
  });
});
