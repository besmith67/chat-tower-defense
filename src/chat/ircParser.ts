/** Parser for Twitch IRC lines with IRCv3 tags. Pure, so it can be tested without a socket. */
import type { ChatEmote, ChatEvent } from './types';

export interface IrcLine {
  tags: Record<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
  trailing: string | null;
}

export function parseIrcLine(line: string): IrcLine | null {
  let rest = line.trim();
  if (!rest) return null;

  const tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    for (const pair of rest.slice(1, space).split(';')) {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      tags[key] = eq === -1 ? '' : unescapeTag(pair.slice(eq + 1));
    }
    rest = rest.slice(space + 1);
  }

  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ');
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }

  let trailing: string | null = null;
  const trailingAt = rest.indexOf(' :');
  if (trailingAt !== -1) {
    trailing = rest.slice(trailingAt + 2);
    rest = rest.slice(0, trailingAt);
  } else if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  }

  const [command, ...params] = rest.split(' ').filter(Boolean);
  if (!command) return null;
  return { tags, prefix, command, params, trailing };
}

function unescapeTag(value: string): string {
  return value.replace(/\\(.)/g, (_, c: string) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' })[c] ?? c);
}

export function twitchEmoteUrl(id: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
}

/**
 * Twitch's emotes tag looks like "25:0-4,12-16/1902:6-10". Positions count Unicode code points,
 * not UTF-16 units, so the text is sliced as an array of code points.
 */
export function parseEmotesTag(tag: string | undefined, text: string): ChatEmote[] {
  if (!tag) return [];
  const chars = Array.from(text);
  const seen = new Map<string, ChatEmote>();
  for (const group of tag.split('/')) {
    const [id, ranges] = group.split(':');
    if (!id || !ranges) continue;
    const [first] = ranges.split(',');
    const [start, end] = first.split('-').map(Number);
    const name = chars.slice(start, end + 1).join('');
    if (name && !seen.has(name)) seen.set(name, { provider: 'twitch', id, name, url: twitchEmoteUrl(id) });
  }
  return [...seen.values()];
}

/** Converts one parsed line into a chat event, or null for lines the game ignores. */
export function ircToChatEvent(line: IrcLine): ChatEvent | null {
  switch (line.command) {
    case 'PRIVMSG': {
      const text = line.trailing ?? '';
      const login = line.prefix?.split('!')[0] ?? 'unknown';
      return {
        type: 'message',
        message: {
          id: line.tags['id'] ?? `${login}-${Date.now()}`,
          platform: 'twitch',
          userId: line.tags['user-id'] ?? login,
          userName: line.tags['display-name'] || login,
          text,
          emotes: parseEmotesTag(line.tags['emotes'], text),
          at: Number(line.tags['tmi-sent-ts']) || Date.now(),
        },
      };
    }
    case 'CLEARMSG':
      return line.tags['target-msg-id'] ? { type: 'delete', messageId: line.tags['target-msg-id'] } : null;
    case 'CLEARCHAT':
      return { type: 'purge', userId: line.tags['target-user-id'] ?? null };
    default:
      return null;
  }
}
