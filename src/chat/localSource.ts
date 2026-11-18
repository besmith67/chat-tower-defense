/** Lets the streamer or a tester type messages as if they came from chat. Used by the dev console. */
import { ChatEmitter, type ChatListener, type ChatSource } from './types';

export class LocalChatSource implements ChatSource {
  readonly platform = 'local' as const;
  private readonly emitter = new ChatEmitter();
  private counter = 0;

  on(listener: ChatListener): () => void {
    return this.emitter.on(listener);
  }

  start(): void {
    this.emitter.emit({ type: 'status', status: 'connected', detail: 'Test chat' });
  }

  stop(): void {}

  /** Each send uses a fresh tester identity so per-viewer caps do not block testing. */
  send(text: string, userName?: string): void {
    this.counter++;
    const name = userName ?? `tester${this.counter}`;
    this.emitter.emit({
      type: 'message',
      message: { id: `local-${this.counter}`, platform: 'local', userId: name, userName: name, text, emotes: [], at: Date.now() },
    });
  }
}
