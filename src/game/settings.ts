import type { ChatMode } from '../sim/collector';
import type { StudioConfig } from '../sim/studio';

export interface GameSettings {
  mode: ChatMode;
  channel: string;
  /** Emote Studio choices for this channel. */
  studio: StudioConfig;
  showNames: boolean;
  blocklist: string[];
}

export function settingsFromUrl(search: string): Partial<GameSettings> & { autostart: boolean } {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  return {
    channel: params.get('channel') ?? undefined,
    mode: mode === 'offline' || mode === 'blended' || mode === 'chat-only' ? mode : undefined,
    showNames: params.has('names') ? params.get('names') !== '0' : undefined,
    autostart: params.get('autostart') === '1',
  };
}
