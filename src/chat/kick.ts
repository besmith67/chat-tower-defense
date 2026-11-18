/**
 * Read-only Kick chat. Kick's own website reads chat over a public Pusher WebSocket, with no login
 * for public chatrooms. This is not an official API: Kick rotated the app key in October 2026, so
 * the key is configurable and the source reports a clear error if Pusher rejects it.
 * Verified against a live channel on 2026-11-18.
 */
import { ChatEmitter, type ChatEmote, type ChatEvent, type ChatListener, type ChatSource } from './types';

export const KICK_PUSHER_KEY = '34bf7a0ff419a2a775b9';
export const KICK_PUSHER_CLUSTER = 'us2';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const EMOTE = /\[emote:(\d+):([^\]\s]+)\]/g;

/** Turns one Pusher event from a Kick chatroom into a ChatEvent, or null for anything else. */
export function kickToChatEvent(event: string, data: Json): ChatEvent | null {
  if (event === 'App\\Events\\ChatMessageEvent') {
    if (!data?.id || !data.sender || typeof data.content !== 'string') return null;
    // Emotes arrive inline as [emote:37226:KEKW]. The game wants plain names plus a list.
    const emotes: ChatEmote[] = [];
    const text = data.content.replace(EMOTE, (_: string, id: string, name: string) => {
      if (!emotes.some((e) => e.name === name)) emotes.push({ provider: 'kick', id, name, url: `https://files.kick.com/emotes/${id}/fullsize` });
      return name;
    });
    return {
      type: 'message',
      message: {
        id: String(data.id),
        platform: 'kick',
        userId: String(data.sender.id),
        userName: String(data.sender.username ?? data.sender.slug ?? 'kick'),
        text,
        emotes,
        at: Date.parse(data.created_at) || Date.now(),
      },
    };
  }
  if (event === 'App\\Events\\MessageDeletedEvent' && data?.message?.id) {
    return { type: 'delete', messageId: String(data.message.id) };
  }
  if (event === 'App\\Events\\UserBannedEvent' && data?.user?.id) {
    return { type: 'purge', userId: String(data.user.id) };
  }
  if (event === 'App\\Events\\ChatroomClearEvent') {
    return { type: 'purge', userId: null };
  }
  return null;
}

export class KickChatSource implements ChatSource {
  readonly platform = 'kick' as const;
  private readonly emitter = new ChatEmitter();
  private readonly slug: string;
  private socket: WebSocket | null = null;
  private stopped = true;
  private retryDelay = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private chatroomId: number | null = null;

  constructor(channel: string, private readonly key = KICK_PUSHER_KEY, private readonly cluster = KICK_PUSHER_CLUSTER) {
    this.slug = channel.trim().replace(/^@/, '').toLowerCase();
  }

  on(listener: ChatListener): () => void {
    return this.emitter.on(listener);
  }

  start(): void {
    if (!this.slug) {
      this.emitter.emit({ type: 'status', status: 'error', detail: 'No Kick channel' });
      return;
    }
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.emitter.emit({ type: 'status', status: 'idle' });
  }

  private async connect(): Promise<void> {
    this.emitter.emit({ type: 'status', status: 'connecting', detail: `kick.com/${this.slug}` });
    if (this.chatroomId === null) {
      try {
        const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(this.slug)}`);
        const info = res.ok ? await res.json() : null;
        this.chatroomId = info?.chatroom?.id ?? null;
      } catch {
        this.chatroomId = null;
      }
      if (this.chatroomId === null) {
        this.emitter.emit({ type: 'status', status: 'error', detail: `Kick channel "${this.slug}" not found` });
        return this.retry();
      }
    }
    if (this.stopped) return;

    const socket = new WebSocket(`wss://ws-${this.cluster}.pusher.com/app/${this.key}?protocol=7&client=js&version=8.4.0&flash=false`);
    this.socket = socket;
    socket.addEventListener('message', (ev) => this.handle(String(ev.data)));
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.stopped) {
        this.emitter.emit({ type: 'status', status: 'disconnected', detail: 'Reconnecting…' });
        this.retry();
      }
    });
    socket.addEventListener('error', () => this.emitter.emit({ type: 'status', status: 'error', detail: 'Connection error' }));
  }

  private retry(): void {
    if (this.stopped) return;
    this.retryTimer = setTimeout(() => void this.connect(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60000);
  }

  private handle(raw: string): void {
    let msg: Json;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.event) {
      case 'pusher:connection_established':
        this.socket?.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${this.chatroomId}.v2` } }));
        return;
      case 'pusher_internal:subscription_succeeded':
        this.retryDelay = 1000;
        this.emitter.emit({ type: 'status', status: 'connected', detail: `kick.com/${this.slug}` });
        return;
      case 'pusher:ping':
        this.socket?.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        return;
      case 'pusher:error': {
        // 4001 means the app key is no longer valid: Kick rotated it. Retrying will not help.
        const code = msg.data?.code;
        this.emitter.emit({ type: 'status', status: 'error', detail: code === 4001 ? 'Kick changed its chat key; the game needs an update' : `Kick error ${code ?? ''}` });
        if (code === 4001) this.stopped = true;
        return;
      }
    }
    let data: Json = msg.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    const event = kickToChatEvent(msg.event, data);
    if (event) this.emitter.emit(event);
  }
}
