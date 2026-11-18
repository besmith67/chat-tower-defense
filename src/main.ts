import Phaser from 'phaser';
import { EmoteDirectory } from './chat/emoteDirectory';
import { ChatHub } from './chat/hub';
import { LocalChatSource } from './chat/localSource';
import { TwitchChatSource } from './chat/twitch';
import { GameScene } from './game/GameScene';
import { settingsFromUrl, type GameSettings } from './game/settings';
import { LAYOUT } from './game/theme';
import { MAPS } from './sim/map';
import { loadStudio } from './sim/studio';
import { openBestiary } from './studio/bestiaryView';
import { openStudio } from './studio/studioView';
import type { ChatMode } from './sim/collector';

const setup = document.getElementById('setup') as HTMLFormElement;
const testChat = document.getElementById('test-chat') as HTMLFormElement;
const fromUrl = settingsFromUrl(location.search);

const field = <T extends HTMLElement>(name: string) => setup.elements.namedItem(name) as T;
const mapSelect = field<HTMLSelectElement>('map');
mapSelect.replaceChildren(...MAPS.map((m) => new Option(`${m.name}: ${m.blurb}`, m.id)));
restoreSetup();
if (fromUrl.channel) field<HTMLInputElement>('channel').value = fromUrl.channel;
if (fromUrl.showNames !== undefined) field<HTMLInputElement>('showNames').checked = fromUrl.showNames;
if (fromUrl.map) mapSelect.value = fromUrl.map;
if (fromUrl.mode) {
  const radio = setup.querySelector<HTMLInputElement>(`input[name="mode"][value="${fromUrl.mode}"]`);
  if (radio) radio.checked = true;
}

setup.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(setup);
  saveSetup(data);
  start({
    mode: (data.get('mode') as ChatMode) ?? 'blended',
    channel: String(data.get('channel') ?? '').trim(),
    studio: loadStudio(String(data.get('channel') ?? '').trim()),
    showNames: data.get('showNames') === 'on',
    map: String(data.get('map') ?? 'switchback'),
    blocklist: String(data.get('blocklist') ?? '')
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean),
  });
});

document.getElementById('open-studio')!.addEventListener('click', () => {
  const channel = field<HTMLInputElement>('channel').value.trim();
  if (!channel) {
    field<HTMLInputElement>('channel').focus();
    field<HTMLInputElement>('channel').placeholder = 'Enter your channel first';
    return;
  }
  void openStudio(channel);
});

document.getElementById('open-bestiary')!.addEventListener('click', () => {
  openBestiary(field<HTMLInputElement>('channel').value.trim());
});

if (fromUrl.autostart) setup.requestSubmit();

async function start(settings: GameSettings): Promise<void> {
  setup.classList.add('hidden');

  const emotes = new EmoteDirectory();
  void emotes.loadGlobal();
  const hub = new ChatHub(emotes);
  if (settings.channel && settings.mode !== 'offline') hub.add(new TwitchChatSource(settings.channel));
  const local = new LocalChatSource();
  hub.add(local);
  hub.start();
  wireTestChat(local, !settings.channel && settings.mode !== 'offline');

  // Wait briefly for the web font so Phaser text renders in it, but never block on it.
  await Promise.race([document.fonts.load('600 16px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: LAYOUT.width,
    height: LAYOUT.height,
    backgroundColor: '#0d0b1a',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    loader: { crossOrigin: 'anonymous' },
    scene: [GameScene],
    callbacks: {
      preBoot: (game) => {
        game.registry.set('settings', settings);
        game.registry.set('hub', hub);
      },
    },
  });

  if (new URLSearchParams(location.search).has('debug')) exposeDebugHooks(game, local);
}

/** Test hooks for scripted playtests (tools/playtest.ts). Only present with ?debug in the URL. */
function exposeDebugHooks(game: Phaser.Game, local: LocalChatSource): void {
  (window as unknown as { __ctd: unknown }).__ctd = {
    game,
    say: (text: string, user?: string) => local.send(text, user),
    scene: () => game.scene.getScene('game'),
  };
}

function wireTestChat(local: LocalChatSource, showByDefault: boolean): void {
  const input = testChat.elements.namedItem('message') as HTMLInputElement;
  if (showByDefault) testChat.classList.remove('hidden');
  testChat.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) local.send(text);
    input.value = '';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === '`') {
      e.preventDefault();
      input.blur();
      if (e.key === '`') testChat.classList.add('hidden');
    }
  });
  window.addEventListener('toggle-test-chat', () => {
    testChat.classList.toggle('hidden');
    if (!testChat.classList.contains('hidden')) input.focus();
  });
}

/** The setup form remembers the streamer's last choices. URL options still win. */
const SETUP_KEY = 'ctd.setup';

function saveSetup(data: FormData): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]))));
  } catch {
    // Storage blocked: nothing to remember.
  }
}

function restoreSetup(): void {
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}');
  } catch {
    return;
  }
  for (const [name, value] of Object.entries(saved)) {
    if (name === 'mode') {
      const radio = setup.querySelector<HTMLInputElement>(`input[name="mode"][value="${CSS.escape(value)}"]`);
      if (radio) radio.checked = true;
    } else if (name !== 'showNames') {
      const el = setup.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
    }
  }
  if (Object.keys(saved).length) field<HTMLInputElement>('showNames').checked = saved.showNames === 'on';
}
