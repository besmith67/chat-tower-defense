/** Combines every chat source into one stream and tracks each source's connection status. */
import type { EmoteDirectory } from './emoteDirectory';
import { ChatEmitter, type ChatListener, type ChatSource, type ConnectionStatus, type Platform } from './types';

export interface SourceStatus {
  platform: Platform;
  status: ConnectionStatus;
  detail: string;
}

export class ChatHub {
  private readonly emitter = new ChatEmitter();
  private readonly sources: ChatSource[] = [];
  readonly statuses = new Map<Platform, SourceStatus>();
  /** Messages per second over the last few seconds, for the HUD. */
  private recent: number[] = [];

  constructor(readonly emotes: EmoteDirectory | null = null) {}

  add(source: ChatSource): void {
    this.sources.push(source);
    this.statuses.set(source.platform, { platform: source.platform, status: 'idle', detail: '' });
    source.on((event) => {
      if (event.type === 'status') {
        this.statuses.set(source.platform, { platform: source.platform, status: event.status, detail: event.detail ?? '' });
      }
      if (event.type === 'room') void this.emotes?.loadChannel(event.roomId);
      if (event.type === 'message') {
        this.recent.push(Date.now());
        if (this.emotes) event = { ...event, message: this.emotes.enrich(event.message) };
      }
      this.emitter.emit(event);
    });
  }

  on(listener: ChatListener): () => void {
    return this.emitter.on(listener);
  }

  start(): void {
    for (const s of this.sources) s.start();
  }

  stop(): void {
    for (const s of this.sources) s.stop();
  }

  messagesPerMinute(): number {
    const cutoff = Date.now() - 20000;
    this.recent = this.recent.filter((t) => t >= cutoff);
    return Math.round(this.recent.length * 3);
  }
}
