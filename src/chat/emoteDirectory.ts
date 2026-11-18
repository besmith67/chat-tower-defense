/**
 * Third-party emotes from 7TV, BTTV, and FFZ. Twitch IRC only tags native Twitch emotes, but chat
 * spams third-party ones constantly (KEKW, Sadge, catJAM), so the game looks words up here.
 * Channel emotes override global ones with the same name. All three APIs are public and CORS-enabled.
 */
import type { ChatEmote, ChatMessage } from './types';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export class EmoteDirectory {
  private global = new Map<string, ChatEmote>();
  private channel = new Map<string, ChatEmote>();
  private loadedChannel: string | null = null;

  get size(): number {
    return new Set([...this.global.keys(), ...this.channel.keys()]).size;
  }

  get channelCount(): number {
    return this.channel.size;
  }

  /** The channel's third-party emotes, sorted by name. */
  channelEmotes(): ChatEmote[] {
    return [...this.channel.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  lookup(name: string): ChatEmote | undefined {
    return this.channel.get(name) ?? this.global.get(name);
  }

  /** Adds third-party emotes found in the text. Native Twitch emotes from IRC tags take precedence. */
  enrich(message: ChatMessage): ChatMessage {
    const known = new Set(message.emotes.map((e) => e.name));
    const found: ChatEmote[] = [];
    for (const word of new Set(message.text.split(/\s+/))) {
      if (!word || known.has(word)) continue;
      const emote = this.lookup(word);
      if (emote) found.push(emote);
    }
    return found.length ? { ...message, emotes: [...message.emotes, ...found] } : message;
  }

  /**
   * Each provider is applied as soon as it answers, so one slow or broken service never blanks the
   * others. Later providers win name collisions (7TV over BTTV over FFZ), whatever order they arrive in.
   */
  async loadGlobal(): Promise<void> {
    const parts: ChatEmote[][] = [[], [], []];
    const apply = () => {
      this.global.clear();
      for (const e of parts.flat()) this.global.set(e.name, e);
    };
    await Promise.all([
      getJson('https://api.frankerfacez.com/v1/set/global').then((j) => ((parts[0] = parseFfz(j)), apply())),
      getJson('https://api.betterttv.net/3/cached/emotes/global').then((j) => ((parts[1] = parseBttv(j)), apply())),
      getJson('https://7tv.io/v3/emote-sets/global').then((j) => ((parts[2] = parse7tvSet(j)), apply())),
    ]);
  }

  async loadChannel(twitchUserId: string): Promise<void> {
    if (this.loadedChannel === twitchUserId) return;
    this.loadedChannel = twitchUserId;
    const parts: ChatEmote[][] = [[], [], []];
    const apply = () => {
      if (this.loadedChannel !== twitchUserId) return;
      this.channel.clear();
      for (const e of parts.flat()) this.channel.set(e.name, e);
    };
    await Promise.all([
      getJson(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`).then((j) => ((parts[0] = parseFfz(j)), apply())),
      getJson(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`).then((j) => ((parts[1] = parseBttv(j)), apply())),
      getJson(`https://7tv.io/v3/users/twitch/${twitchUserId}`).then((j) => ((parts[2] = parse7tvSet(j?.emote_set)), apply())),
    ]);
  }
}

/** Gives up after a few seconds, so a hung service cannot stall the others. */
async function getJson(url: string, timeoutMs = 8000): Promise<Json> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** 7TV emote set. Active emote flag bit 1 marks zero-width overlay emotes. */
export function parse7tvSet(set: Json): ChatEmote[] {
  if (!set || !Array.isArray(set.emotes)) return [];
  return set.emotes
    .filter((e: Json) => e?.id && e?.name)
    .map((e: Json) => ({
      provider: '7tv' as const,
      id: String(e.id),
      name: String(e.name),
      url: `https://cdn.7tv.app/emote/${e.id}/2x.webp`,
      zeroWidth: (Number(e.flags) & 1) === 1,
    }));
}

/** BTTV global is an array. A BTTV user has channelEmotes and sharedEmotes. */
export function parseBttv(json: Json): ChatEmote[] {
  if (!json) return [];
  const list: Json[] = Array.isArray(json) ? json : [...(json.channelEmotes ?? []), ...(json.sharedEmotes ?? [])];
  return list
    .filter((e) => e?.id && e?.code)
    .map((e) => ({ provider: 'bttv' as const, id: String(e.id), name: String(e.code), url: `https://cdn.betterttv.net/emote/${e.id}/2x` }));
}

/** FFZ global and room responses both carry a sets map of emoticons. */
export function parseFfz(json: Json): ChatEmote[] {
  if (!json?.sets) return [];
  const out: ChatEmote[] = [];
  for (const set of Object.values<Json>(json.sets)) {
    for (const e of set?.emoticons ?? []) {
      if (!e?.id || !e?.name || e.hidden) continue;
      let url: string = e.urls?.['2'] ?? e.urls?.['1'] ?? '';
      if (url.startsWith('//')) url = `https:${url}`;
      if (url) out.push({ provider: 'ffz', id: String(e.id), name: String(e.name), url });
    }
  }
  return out;
}
