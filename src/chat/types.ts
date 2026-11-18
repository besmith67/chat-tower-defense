/** Every chat platform, and the local test input, is normalized into these events. */

export type Platform = 'twitch' | 'youtube' | 'kick' | 'local';

export interface ChatEmote {
  provider: 'twitch' | '7tv' | 'bttv' | 'ffz' | 'kick';
  id: string;
  name: string;
  url: string;
  /** 7TV zero-width emotes overlay the emote before them. */
  zeroWidth?: boolean;
}

export interface ChatMessage {
  id: string;
  platform: Platform;
  userId: string;
  userName: string;
  text: string;
  /** Emotes the platform identified in the text, by name. */
  emotes: ChatEmote[];
  at: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  /** A moderator deleted one message. */
  | { type: 'delete'; messageId: string }
  /** A user was timed out or banned, or the whole chat was cleared when userId is null. */
  | { type: 'purge'; userId: string | null }
  /** The platform told us the channel's numeric id, which third-party emote services key on. */
  | { type: 'room'; roomId: string }
  | { type: 'status'; status: ConnectionStatus; detail?: string };

export type ChatListener = (event: ChatEvent) => void;

export interface ChatSource {
  readonly platform: Platform;
  start(): void;
  stop(): void;
  on(listener: ChatListener): () => void;
}

/** Shared listener bookkeeping for sources. */
export class ChatEmitter {
  private listeners = new Set<ChatListener>();

  on(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ChatEvent): void {
    for (const l of this.listeners) l(event);
  }
}
