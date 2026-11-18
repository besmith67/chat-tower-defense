/**
 * Read-only Twitch chat over WebSocket. Uses Twitch's anonymous "justinfan" login,
 * so reading chat needs no account, token, or app registration.
 */
import { ircToChatEvent, parseIrcLine } from './ircParser';
import { ChatEmitter, type ChatListener, type ChatSource } from './types';

const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

export class TwitchChatSource implements ChatSource {
  readonly platform = 'twitch' as const;
  private readonly emitter = new ChatEmitter();
  private readonly channel: string;
  private socket: WebSocket | null = null;
  private stopped = true;
  private retryDelay = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(channel: string) {
    this.channel = channel.trim().replace(/^#/, '').toLowerCase();
  }

  on(listener: ChatListener): () => void {
    return this.emitter.on(listener);
  }

  start(): void {
    if (!this.channel) {
      this.emitter.emit({ type: 'status', status: 'error', detail: 'No channel name' });
      return;
    }
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.emitter.emit({ type: 'status', status: 'idle' });
  }

  private connect(): void {
    this.emitter.emit({ type: 'status', status: 'connecting', detail: `#${this.channel}` });
    const socket = new WebSocket(TWITCH_IRC_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      socket.send('PASS SCHMOOPIIE');
      socket.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
      socket.send(`JOIN #${this.channel}`);
    });

    socket.addEventListener('message', (ev) => {
      for (const raw of String(ev.data).split('\r\n')) this.handleLine(raw);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.emitter.emit({ type: 'status', status: 'disconnected', detail: 'Reconnecting…' });
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    });

    socket.addEventListener('error', () => {
      this.emitter.emit({ type: 'status', status: 'error', detail: 'Connection error' });
    });
  }

  private handleLine(raw: string): void {
    const line = parseIrcLine(raw);
    if (!line) return;

    if (line.command === 'PING') {
      this.socket?.send(`PONG :${line.trailing ?? 'tmi.twitch.tv'}`);
      return;
    }
    if (line.command === 'RECONNECT') {
      this.socket?.close();
      return;
    }
    if (line.command === 'ROOMSTATE') {
      this.retryDelay = 1000;
      this.emitter.emit({ type: 'status', status: 'connected', detail: `#${this.channel}` });
      if (line.tags['room-id']) this.emitter.emit({ type: 'room', roomId: line.tags['room-id'] });
      return;
    }

    const event = ircToChatEvent(line);
    if (event) this.emitter.emit(event);
  }
}
