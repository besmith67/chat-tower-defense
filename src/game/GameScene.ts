/**
 * The play screen. Renders the simulation, runs the HUD, the build controls, the incoming-chat
 * panel, and the inspect panel. All game rules live in src/sim; this file only draws and reads input.
 */
import Phaser from 'phaser';
import type { ChatHub } from '../chat/hub';
import type { ChatEmote, ChatEvent } from '../chat/types';
import { setStreamerBlocklist, type EmoteRef, type Genome } from '../genome';
import { QUIRK_INFO, formText, weaknessText } from '../genome/describe';
import { BALANCE } from '../sim/balance';
import { BASE_TILE, COLS, ROWS, TILE, tileKey } from '../sim/map';
import { Match } from '../sim/match';
import { TOWERS, TOWER_ORDER, type TowerId } from '../sim/towers';
import type { Monster, SimEvent, Tower } from '../sim/world';
import { monsterTexture, towerTextures } from './monsterArt';
import type { GameSettings } from './settings';
import { COLORS, FONT, LAYOUT } from './theme';

interface MonsterView {
  root: Phaser.GameObjects.Container;
  bodyRoot: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image | null;
  label: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  shield: Phaser.GameObjects.Arc | null;
  lastX: number;
}

interface Button {
  zone: Phaser.GameObjects.Zone;
  bg: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Obj = Phaser.GameObjects.GameObject;

const text = (style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: '16px',
  color: COLORS.text,
  ...style,
});

const sx = (x: number) => x + LAYOUT.playX;
const sy = (y: number) => y + LAYOUT.playY;

export class GameScene extends Phaser.Scene {
  private settings!: GameSettings;
  private hub!: ChatHub;
  private match!: Match;
  private unsubscribe: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private monsterViews = new Map<number, MonsterView>();
  private towerViews = new Map<number, Phaser.GameObjects.Image>();
  private stunMarks = new Map<number, Phaser.GameObjects.Text>();
  private failedEmotes = new Set<string>();

  private selectedBuild: TowerId | null = null;
  private selectedTower: Tower | null = null;
  private hoveredMonster: Monster | null = null;
  private spotlight: Monster | null = null;
  private pointerTile: [number, number] | null = null;
  private speed = 1;
  private floaters = 0;
  private uiClock = 0;
  private panelClock = 0;
  private inspectKey = '';

  private ghost!: Phaser.GameObjects.Graphics;
  private hud!: Record<'wave' | 'phase' | 'lives' | 'gold' | 'split' | 'status', Phaser.GameObjects.Text>;
  private towerButtons = new Map<TowerId, Button>();
  private startButton!: Button & { label: Phaser.GameObjects.Text };
  private speedButton!: Button & { label: Phaser.GameObjects.Text };
  private panelRows: Obj[] = [];
  private inspectObjs: Obj[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;
  private toast: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('game');
  }

  init(): void {
    this.settings = this.registry.get('settings');
    this.hub = this.registry.get('hub');
    setStreamerBlocklist(this.settings.blocklist);
    this.match = new Match({ mode: this.settings.mode });
    this.match.collector.setShowNames(this.settings.showNames);
    this.monsterViews = new Map();
    this.towerViews = new Map();
    this.stunMarks = new Map();
    this.selectedBuild = null;
    this.selectedTower = null;
    this.hoveredMonster = null;
    this.spotlight = null;
    this.pointerTile = null;
    this.speed = 1;
    this.floaters = 0;
    this.inspectKey = '';
    this.panelRows = [];
    this.inspectObjs = [];
    this.overlay = null;
    this.toast = null;
    this.towerButtons = new Map();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    towerTextures(this);
    this.drawMap();
    this.ghost = this.add.graphics().setDepth(15);
    this.buildHud();
    this.buildBottomBar();
    this.buildPanel();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.failedEmotes.add(file.key));

    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.unsubscribe = this.hub.on((e) => this.onChat(e));
    this.registry.set('match', this.match);

    this.events.once('shutdown', () => {
      this.unsubscribe?.();
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    });
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    for (let i = 0; i < this.speed; i++) this.match.update(dt);

    for (const event of this.match.world.drainEvents()) this.onSimEvent(event);
    this.syncMonsters();
    this.syncStuns();
    this.drawGhost();

    this.uiClock += deltaMs;
    this.panelClock += deltaMs;
    if (this.uiClock > 150) {
      this.uiClock = 0;
      this.refreshHud();
      this.refreshInspect();
    }
    if (this.panelClock > 400) {
      this.panelClock = 0;
      this.refreshPanel();
    }
    if ((this.match.phase === 'won' || this.match.phase === 'lost') && !this.overlay) this.showEndOverlay();
  }

  // ---------------------------------------------------------------- chat

  private onChat(event: ChatEvent): void {
    this.match.handleChat(event);
    if (event.type === 'message') for (const emote of event.message.emotes) this.ensureEmote(emote);
  }

  private emoteKey(emote: EmoteRef | ChatEmote): string {
    return `emote:${emote.provider}:${emote.id}`;
  }

  private ensureEmote(emote: EmoteRef | ChatEmote): void {
    const key = this.emoteKey(emote);
    if (this.textures.exists(key) || this.failedEmotes.has(key)) return;
    this.load.image(key, emote.url);
    this.load.start();
  }

  // ---------------------------------------------------------------- map

  private drawMap(): void {
    const g = this.add.graphics().setDepth(0);
    const { pathTiles, portals } = this.match.world.map;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = sx(c * TILE);
        const y = sy(r * TILE);
        if (pathTiles.has(tileKey(c, r))) {
          g.fillStyle(COLORS.pathEdge, 1);
          g.fillRect(x, y, TILE, TILE);
          g.fillStyle(COLORS.path, 1);
          g.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        } else {
          g.fillStyle((c + r) % 2 ? COLORS.tileA : COLORS.tileB, 1);
          g.fillRect(x, y, TILE, TILE);
        }
      }
    }
    // Smooth the road by filling between neighbouring path tiles.
    g.fillStyle(COLORS.path, 1);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (!pathTiles.has(tileKey(c, r))) continue;
        if (pathTiles.has(tileKey(c + 1, r))) g.fillRect(sx(c * TILE + TILE - 3), sy(r * TILE + 3), 6, TILE - 6);
        if (pathTiles.has(tileKey(c, r + 1))) g.fillRect(sx(c * TILE + 3), sy(r * TILE + TILE - 3), TILE - 6, 6);
      }
    }

    // Chat portal.
    const cp = portals.chat;
    g.fillStyle(COLORS.chat, 0.25);
    g.fillCircle(sx(cp.x), sy(cp.y), 30);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(sx(cp.x), sy(cp.y), 21);
    g.fillStyle(COLORS.chat, 1);
    g.fillCircle(sx(cp.x), sy(cp.y), 18);
    g.fillStyle(0xd9c6ff, 1);
    g.fillCircle(sx(cp.x), sy(cp.y), 8);
    this.add.text(sx(cp.x) + 2, sy(cp.y) - 34, 'CHAT', text({ fontSize: '13px', color: COLORS.chatText, fontStyle: 'bold' })).setOrigin(0, 1).setDepth(2);

    // Wilds portal: glitchy and grey, visibly not chat.
    const wp = portals.wilds;
    g.fillStyle(0xff2bd6, 0.6);
    g.fillCircle(sx(wp.x) - 2, sy(wp.y), 21);
    g.fillStyle(0x2bfff0, 0.6);
    g.fillCircle(sx(wp.x) + 2, sy(wp.y), 21);
    g.fillStyle(COLORS.wilds, 1);
    g.fillCircle(sx(wp.x), sy(wp.y), 18);
    g.fillStyle(0x000000, 0.3);
    for (let i = -16; i < 18; i += 4) g.fillRect(sx(wp.x) - 16, sy(wp.y) + i, 32, 1.5);
    this.add.text(sx(wp.x) + 2, sy(wp.y) + 34, 'WILDS', text({ fontSize: '13px', color: COLORS.wildsText, fontStyle: 'bold' })).setOrigin(0, 0).setDepth(2);

    // Base.
    const bx = sx(BASE_TILE[0] * TILE + TILE / 2);
    const by = sy(BASE_TILE[1] * TILE + TILE / 2);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(bx - 19, by - 16, 38, 34, 6);
    for (let i = 0; i < 3; i++) g.fillRect(bx - 19 + i * 14, by - 24, 10, 10);
    g.fillStyle(0xff6b8b, 1);
    g.fillRoundedRect(bx - 15, by - 12, 30, 26, 4);
    for (let i = 0; i < 3; i++) g.fillRect(bx - 16 + i * 13, by - 20, 7, 8);
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(bx - 5, by + 2, 10, 12, { tl: 5, tr: 5, bl: 0, br: 0 });
  }

  // ---------------------------------------------------------------- HUD

  private buildHud(): void {
    const g = this.add.graphics().setDepth(90);
    g.fillStyle(COLORS.panel, 1);
    g.fillRect(0, 0, LAYOUT.width, LAYOUT.topBar);
    g.fillStyle(COLORS.panelEdge, 1);
    g.fillRect(0, LAYOUT.topBar - 2, LAYOUT.width, 2);
    const y = LAYOUT.topBar / 2;
    const mk = (x: number, style: Partial<Phaser.Types.GameObjects.Text.TextStyle>, originX = 0) =>
      this.add.text(x, y, '', text(style)).setOrigin(originX, 0.5).setDepth(91);
    this.hud = {
      wave: mk(16, { fontSize: '20px', fontStyle: 'bold' }),
      phase: mk(150, { fontSize: '16px', color: COLORS.muted }),
      lives: mk(520, { fontSize: '20px', fontStyle: 'bold', color: COLORS.lives }),
      gold: mk(600, { fontSize: '20px', fontStyle: 'bold', color: COLORS.gold }),
      split: mk(720, { fontSize: '15px', color: COLORS.muted }),
      status: mk(LAYOUT.width - 14, { fontSize: '14px', color: COLORS.muted }, 1),
    };
  }

  private refreshHud(): void {
    const m = this.match;
    const w = m.world;
    this.hud.wave.setText(`WAVE ${m.wave} / ${BALANCE.totalWaves}`);
    if (m.phase === 'build') {
      const secs = Math.max(0, Math.ceil(m.timer));
      this.hud.phase.setText(`Build phase  ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}  ·  chat is summoning`);
    } else if (m.phase === 'wave') {
      this.hud.phase.setText(`Wave in progress  ·  ${w.monsters.length + w.queuedCount} monsters left`);
    } else {
      this.hud.phase.setText(m.phase === 'won' ? 'Victory!' : 'Defeated');
    }
    this.hud.lives.setText(`♥ ${w.lives}`);
    this.hud.gold.setText(`◆ ${w.gold}`);

    const total = m.totals.chat + m.totals.wilds;
    if (m.mode === 'offline') this.hud.split.setText('Offline practice · all Wilds');
    else if (total === 0) this.hud.split.setText('Chat 0% · Wilds 0%');
    else {
      const chat = Math.round((m.totals.chat / total) * 100);
      this.hud.split.setText(`Chat ${chat}% · Wilds ${100 - chat}%`);
    }

    const twitch = this.hub.statuses.get('twitch');
    const rate = this.hub.messagesPerMinute();
    const emoteCount = this.hub.emotes?.size ?? 0;
    if (twitch) {
      const dot = twitch.status === 'connected' ? '●' : '○';
      this.hud.status.setText(`Twitch ${twitch.detail || ''} ${dot} ${twitch.status}  ·  ${rate} msg/min  ·  ${emoteCount} emotes`);
      this.hud.status.setColor(twitch.status === 'connected' ? COLORS.chatText : COLORS.muted);
    } else {
      this.hud.status.setText(`No channel · test chat (\`)  ·  ${rate} msg/min`);
    }

    this.styleButtons();
  }

  private buildBottomBar(): void {
    const g = this.add.graphics().setDepth(90);
    g.fillStyle(COLORS.panel, 1);
    g.fillRect(0, LAYOUT.bottomY, LAYOUT.panelX, LAYOUT.height - LAYOUT.bottomY);
    g.fillStyle(COLORS.panelEdge, 1);
    g.fillRect(0, LAYOUT.bottomY, LAYOUT.panelX, 2);

    TOWER_ORDER.forEach((id, i) => {
      const def = TOWERS[id];
      const b = this.makeButton(12 + i * 206, LAYOUT.bottomY + 9, 198, 56, () => this.selectBuild(id));
      this.add.image(b.x + 30, b.y + 28, `tower-${id}`).setDepth(92).setScale(0.9);
      this.add.text(b.x + 60, b.y + 10, def.name, text({ fontSize: '17px', fontStyle: 'bold' })).setDepth(92);
      this.add.text(b.x + 60, b.y + 32, `◆ ${def.cost}`, text({ fontSize: '14px', color: COLORS.gold })).setDepth(92);
      this.add.text(b.x + b.w - 10, b.y + 10, `[${def.hotkey}]`, text({ fontSize: '13px', color: COLORS.muted })).setOrigin(1, 0).setDepth(92);
      this.add
        .text(b.x + b.w - 10, b.y + 32, def.kind === 'pierce' ? 'pierce' : def.kind === 'blunt' ? 'blunt' : 'slow', text({ fontSize: '12px', color: COLORS.muted }))
        .setOrigin(1, 0)
        .setDepth(92);
      this.towerButtons.set(id, b);
    });

    const start = this.makeButton(636, LAYOUT.bottomY + 9, 210, 56, () => this.match.startWave());
    const startLabel = this.add.text(start.x + start.w / 2, start.y + 28, '', text({ fontSize: '17px', fontStyle: 'bold' })).setOrigin(0.5).setDepth(92);
    this.startButton = { ...start, label: startLabel };

    const speed = this.makeButton(856, LAYOUT.bottomY + 9, 132, 56, () => this.cycleSpeed());
    const speedLabel = this.add.text(speed.x + speed.w / 2, speed.y + 28, '', text({ fontSize: '17px', fontStyle: 'bold' })).setOrigin(0.5).setDepth(92);
    this.speedButton = { ...speed, label: speedLabel };
    this.styleButtons();
  }

  private makeButton(x: number, y: number, w: number, h: number, onClick: () => void): Button {
    const bg = this.add.graphics().setDepth(91);
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(93);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) onClick();
    });
    return { zone, bg, x, y, w, h };
  }

  private paintButton(b: Button, fill: number, edge: number, alpha = 1): void {
    b.bg.clear();
    b.bg.fillStyle(edge, alpha);
    b.bg.fillRoundedRect(b.x, b.y, b.w, b.h, 10);
    b.bg.fillStyle(fill, alpha);
    b.bg.fillRoundedRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, 9);
  }

  private styleButtons(): void {
    const gold = this.match.world.gold;
    for (const [id, b] of this.towerButtons) {
      const def = TOWERS[id];
      const selected = this.selectedBuild === id;
      this.paintButton(b, selected ? 0x2d2659 : 0x1c1838, selected ? 0xffffff : gold >= def.cost ? COLORS.panelEdge : 0x1f1b33, gold >= def.cost ? 1 : 0.55);
    }
    const canStart = this.match.phase === 'build';
    this.paintButton(this.startButton, canStart ? 0x3a2a7a : 0x1c1838, canStart ? COLORS.chat : COLORS.panelEdge);
    this.startButton.label.setText(canStart ? 'START WAVE  [Space]' : 'WAVE RUNNING');
    this.startButton.label.setColor(canStart ? COLORS.text : COLORS.muted);
    this.paintButton(this.speedButton, 0x1c1838, COLORS.panelEdge);
    this.speedButton.label.setText(`${this.speed}x  [F]`);
  }

  // ---------------------------------------------------------------- right panel

  private buildPanel(): void {
    const g = this.add.graphics().setDepth(90);
    g.fillStyle(COLORS.panel, 1);
    g.fillRect(LAYOUT.panelX, LAYOUT.topBar, LAYOUT.width - LAYOUT.panelX, LAYOUT.height - LAYOUT.topBar);
    g.fillStyle(COLORS.panelEdge, 1);
    g.fillRect(LAYOUT.panelX, LAYOUT.topBar, 2, LAYOUT.height - LAYOUT.topBar);
    g.fillRect(LAYOUT.panelX + 14, 418, LAYOUT.width - LAYOUT.panelX - 28, 2);
    this.add.text(LAYOUT.panelX + 16, 62, 'NEXT WAVE FROM CHAT', text({ fontSize: '14px', fontStyle: 'bold', color: COLORS.chatText })).setDepth(91);
    this.add
      .text(LAYOUT.panelX + 16, LAYOUT.height - 12, '1-3 build · Esc cancel · S sell · F speed · ` test chat', text({ fontSize: '11px', color: COLORS.muted }))
      .setOrigin(0, 1)
      .setDepth(91);
  }

  private refreshPanel(): void {
    for (const o of this.panelRows) o.destroy();
    this.panelRows = [];
    const x = LAYOUT.panelX + 16;
    let y = 90;
    const pending = this.match.collector.pending;

    if (this.match.mode === 'offline') {
      this.panelRows.push(this.add.text(x, y, 'Offline practice. Chat is ignored and the Wilds send every monster.', text({ fontSize: '13px', color: COLORS.muted, wordWrap: { width: 250 } })).setDepth(91));
      return;
    }
    if (pending.length === 0) {
      this.panelRows.push(
        this.add.text(x, y, 'Nothing yet. Chat sends monsters by typing one word or an emote.', text({ fontSize: '13px', color: COLORS.muted, wordWrap: { width: 250 } })).setDepth(91),
      );
      y += 44;
    }

    const nextWave = this.match.phase === 'build' ? this.match.wave : this.match.wave + 1;
    const fits = this.match.collector.preview(BALANCE.waveBudget(nextWave));
    const shown = pending.slice(0, 8);
    for (const p of shown) {
      const waiting = !fits.has(p.genome.key);
      const alpha = waiting ? 0.45 : 1;
      const tex = monsterTexture(this, p.genome);
      const icon = this.add.image(x + 12, y + 12, tex.key).setOrigin(tex.originX, tex.originY).setDepth(91).setAlpha(alpha);
      icon.setScale(Math.min(1, 22 / (p.genome.look.radius * 2)));
      this.panelRows.push(icon);
      if (p.genome.emote && this.textures.exists(this.emoteKey(p.genome.emote))) {
        this.panelRows.push(this.add.image(x + 12, y + 12, this.emoteKey(p.genome.emote)).setDisplaySize(20, 20).setDepth(92).setAlpha(alpha));
      }
      const copies = p.contributions.length;
      this.panelRows.push(this.add.text(x + 32, y + 3, p.genome.token, text({ fontSize: '15px', fontStyle: 'bold' })).setDepth(91).setAlpha(alpha));
      const right = waiting ? 'waiting' : copies > 1 ? `×${copies}` : '';
      if (right) {
        this.panelRows.push(
          this.add.text(LAYOUT.width - 16, y + 3, right, text({ fontSize: waiting ? '12px' : '15px', color: waiting ? COLORS.muted : COLORS.gold })).setOrigin(1, 0).setDepth(91),
        );
      }
      const who = p.contributions[0]?.userName ?? '';
      const others = copies > 1 ? ` +${copies - 1}` : '';
      this.panelRows.push(this.add.text(x + 32, y + 21, who ? `by ${who}${others}` : '', text({ fontSize: '11px', color: COLORS.muted })).setDepth(91).setAlpha(alpha));
      y += 34;
    }
    if (pending.length > shown.length) {
      this.panelRows.push(this.add.text(x, y, `+${pending.length - shown.length} more species waiting`, text({ fontSize: '12px', color: COLORS.muted })).setDepth(91));
    }
    const note =
      this.match.mode === 'blended' ? 'The Wilds fill whatever budget chat leaves unspent.' : 'Chat only: no Wilds. A silent chat means an empty wave.';
    this.panelRows.push(this.add.text(x, 384, note, text({ fontSize: '11px', color: COLORS.wildsText, wordWrap: { width: 250 } })).setDepth(91));
  }

  private refreshInspect(): void {
    if (this.spotlight && !this.spotlight.alive) this.spotlight = null;
    if (this.hoveredMonster && !this.hoveredMonster.alive) this.hoveredMonster = null;
    const monster = this.hoveredMonster ?? (this.selectedTower ? null : this.spotlight);
    const tower = this.hoveredMonster ? null : this.selectedTower;
    const key = monster ? `m${monster.id}` : tower ? `t${tower.id}:${tower.kills.size}:${[...tower.kills.values()].join()}` : 'none';
    if (key === this.inspectKey) return;
    this.inspectKey = key;
    for (const o of this.inspectObjs) o.destroy();
    this.inspectObjs = [];
    const x = LAYOUT.panelX + 16;
    const add = <T extends Obj>(o: T): T => {
      this.inspectObjs.push(o);
      return o;
    };

    if (monster) this.inspectMonster(monster, x, add);
    else if (tower) this.inspectTower(tower, x, add);
    else {
      add(this.add.text(x, 432, 'INSPECT', text({ fontSize: '14px', fontStyle: 'bold', color: COLORS.muted })).setDepth(91));
      add(this.add.text(x, 456, 'Hover a monster to see how its word shaped it. Click a tower to inspect or sell it.', text({ fontSize: '13px', color: COLORS.muted, wordWrap: { width: 250 } })).setDepth(91));
    }
  }

  private inspectMonster(m: Monster, x: number, add: <T extends Obj>(o: T) => T): void {
    const g = m.genome;
    const heading = this.hoveredMonster ? 'INSPECT' : 'LATEST FROM CHAT';
    add(this.add.text(x, 432, heading, text({ fontSize: '14px', fontStyle: 'bold', color: g.source === 'wilds' ? COLORS.wildsText : COLORS.chatText })).setDepth(91));
    const tex = monsterTexture(this, g);
    const icon = add(this.add.image(x + 30, 488, tex.key).setOrigin(tex.originX, tex.originY).setDepth(91));
    icon.setScale(Math.min(1.6, 54 / (g.look.radius * 2)));
    if (g.emote && this.textures.exists(this.emoteKey(g.emote))) add(this.add.image(x + 30, 488, this.emoteKey(g.emote)).setDisplaySize(40, 40).setDepth(92));

    add(this.add.text(x + 70, 456, g.token, text({ fontSize: '20px', fontStyle: 'bold' })).setDepth(91));
    const origin = g.source === 'wilds' ? '⟡ Wild creature, not from chat' : `sent by ${m.order.sender ?? 'chat'}${m.order.copies > 1 ? ` · ×${m.order.copies} merged` : ''}`;
    add(this.add.text(x + 70, 482, g.archetype ? `${g.archetype} · ${origin}` : origin, text({ fontSize: '12px', color: COLORS.muted, wordWrap: { width: 180 } })).setDepth(91));
    add(this.add.text(x, 522, formText(g), text({ fontSize: '12px', color: COLORS.muted })).setDepth(91));

    const bars: [string, number, number][] = [
      ['HP', g.weights.hp, 0xff6b8b],
      ['SPD', g.weights.speed, 0x4cc9f0],
      ['ARM', g.weights.armor, 0xffd166],
    ];
    bars.forEach(([label, value, color], i) => {
      const by = 544 + i * 16;
      add(this.add.text(x, by, label, text({ fontSize: '11px', color: COLORS.muted })).setDepth(91));
      add(this.add.rectangle(x + 34, by + 3, 200, 8, 0x2b2550).setOrigin(0).setDepth(91));
      add(this.add.rectangle(x + 34, by + 3, Math.max(4, 200 * Math.min(1, value * 1.8)), 8, color).setOrigin(0).setDepth(92));
    });

    let y = 596;
    for (const q of g.quirks.slice(0, 3)) {
      const info = QUIRK_INFO[q];
      const t = add(this.add.text(x, y, `${info.label}: ${info.detail}`, text({ fontSize: '12px', color: COLORS.text, wordWrap: { width: 250 } })).setDepth(91));
      y += t.height + 3;
    }
    add(this.add.text(x, Math.min(y + 2, 672), weaknessText(g), text({ fontSize: '12px', color: COLORS.strong, wordWrap: { width: 250 } })).setDepth(91));
  }

  private inspectTower(t: Tower, x: number, add: <T extends Obj>(o: T) => T): void {
    add(this.add.text(x, 432, 'TOWER', text({ fontSize: '14px', fontStyle: 'bold', color: COLORS.muted })).setDepth(91));
    add(this.add.image(x + 22, 478, `tower-${t.def.id}`).setDepth(91));
    add(this.add.text(x + 54, 460, t.def.name, text({ fontSize: '20px', fontStyle: 'bold' })).setDepth(91));
    add(this.add.text(x, 508, t.def.blurb, text({ fontSize: '12px', color: COLORS.muted, wordWrap: { width: 250 } })).setDepth(91));
    const kills = [...t.kills.values()].reduce((a, b) => a + b, 0);
    add(this.add.text(x, 548, `Kills: ${kills}`, text({ fontSize: '13px' })).setDepth(91));
    const top = [...t.kills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    let y = 568;
    if (top.length) {
      add(this.add.text(x, y, 'Adapted against:', text({ fontSize: '12px', color: COLORS.muted })).setDepth(91));
      y += 18;
      for (const [speciesKey, n] of top) {
        const name = speciesKey.split('|')[1]?.replace(/^twitch#\d+$/, 'emote') ?? speciesKey;
        const bonus = Math.round(Math.min(BALANCE.adaptationCap, n * BALANCE.adaptationPerKill) * 100);
        add(this.add.text(x + 8, y, `${name}  +${bonus}%`, text({ fontSize: '12px', color: COLORS.strong })).setDepth(91));
        y += 16;
      }
    }
    const refund = Math.floor(t.spent * BALANCE.sellRefund);
    add(this.add.text(x, 664, `Press S to sell for ◆ ${refund}`, text({ fontSize: '13px', color: COLORS.gold })).setDepth(91));
  }

  // ---------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    const tower = TOWER_ORDER.find((id) => TOWERS[id].hotkey === key);
    if (tower) this.selectBuild(tower);
    else if (key === 'escape') this.clearSelection();
    else if (key === ' ') {
      e.preventDefault();
      this.match.startWave();
    } else if (key === 'f') this.cycleSpeed();
    else if (key === 's' && this.selectedTower) this.sellSelected();
    else if (key === 'r' && this.overlay) this.scene.restart();
    else if (key === '`') {
      e.preventDefault();
      window.dispatchEvent(new Event('toggle-test-chat'));
    }
  }

  private selectBuild(id: TowerId): void {
    this.selectedBuild = this.selectedBuild === id ? null : id;
    this.selectedTower = null;
    this.styleButtons();
  }

  private clearSelection(): void {
    this.selectedBuild = null;
    this.selectedTower = null;
    this.styleButtons();
  }

  private cycleSpeed(): void {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.styleButtons();
  }

  private tileAt(p: Phaser.Input.Pointer): [number, number] | null {
    const x = p.x - LAYOUT.playX;
    const y = p.y - LAYOUT.playY;
    if (x < 0 || y < 0 || x >= COLS * TILE || y >= ROWS * TILE) return null;
    return [Math.floor(x / TILE), Math.floor(y / TILE)];
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.pointerTile = this.tileAt(p);
    this.hoveredMonster = null;
    if (!this.pointerTile) return;
    let best: Monster | null = null;
    let bestD = Infinity;
    for (const m of this.match.world.monsters) {
      const d = Math.hypot(sx(m.x) - p.x, sy(m.y) - p.y);
      if (d < m.radius + 8 && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    this.hoveredMonster = best;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.clearSelection();
      return;
    }
    const tile = this.tileAt(p);
    if (!tile) return;
    const [col, row] = tile;
    if (this.selectedBuild) {
      const def = TOWERS[this.selectedBuild];
      if (this.match.world.gold < def.cost) return this.flash('Not enough gold');
      if (!this.match.world.canPlace(col, row)) return this.flash("Can't build there");
      const tower = this.match.placeTower(this.selectedBuild, col, row);
      if (tower) this.addTowerView(tower);
      return;
    }
    const existing = this.match.world.towerAt(col, row);
    this.selectedTower = existing ?? null;
    if (!existing && this.hoveredMonster) this.spotlight = this.hoveredMonster;
  }

  /** Places a tower exactly like a click would. Used by scripted playtests. */
  debugPlace(id: TowerId, col: number, row: number): boolean {
    const tower = this.match.placeTower(id, col, row);
    if (tower) this.addTowerView(tower);
    return !!tower;
  }

  private sellSelected(): void {
    const t = this.selectedTower;
    if (!t) return;
    const refund = this.match.sellTower(t);
    this.towerViews.get(t.id)?.destroy();
    this.towerViews.delete(t.id);
    this.floatText(sx(t.x), sy(t.y) - 20, `+◆${refund}`, COLORS.gold);
    this.selectedTower = null;
  }

  private drawGhost(): void {
    const g = this.ghost;
    g.clear();
    const showRange = (x: number, y: number, range: number, color: number) => {
      g.lineStyle(2, color, 0.7);
      g.strokeCircle(x, y, range);
      g.fillStyle(color, 0.07);
      g.fillCircle(x, y, range);
    };
    if (this.selectedTower) {
      const t = this.selectedTower;
      showRange(sx(t.x), sy(t.y), t.def.range, 0xffffff);
      g.lineStyle(2, 0xffffff, 1);
      g.strokeRoundedRect(sx(t.col * TILE) + 1, sy(t.row * TILE) + 1, TILE - 2, TILE - 2, 6);
    }
    if (!this.selectedBuild || !this.pointerTile) return;
    const [col, row] = this.pointerTile;
    const def = TOWERS[this.selectedBuild];
    const ok = this.match.world.canPlace(col, row) && this.match.world.gold >= def.cost;
    const color = ok ? 0x7cff9b : 0xff5c7a;
    const cx = sx(col * TILE + TILE / 2);
    const cy = sy(row * TILE + TILE / 2);
    showRange(cx, cy, def.range, color);
    g.fillStyle(color, 0.35);
    g.fillRoundedRect(sx(col * TILE) + 2, sy(row * TILE) + 2, TILE - 4, TILE - 4, 6);
  }

  // ---------------------------------------------------------------- simulation events

  private addTowerView(t: Tower): void {
    const img = this.add.image(sx(t.x), sy(t.y), `tower-${t.def.id}`).setDepth(10 + t.y / 1000).setScale(0.2);
    this.tweens.add({ targets: img, scale: 0.92, duration: 220, ease: 'Back.Out' });
    this.towerViews.set(t.id, img);
  }

  private onSimEvent(e: SimEvent): void {
    switch (e.type) {
      case 'spawn':
        this.createMonsterView(e.monster);
        if (e.monster.genome.source === 'chat' && e.monster.order.cost > 0) this.spotlight = e.monster;
        break;
      case 'shot':
        this.shotFx(e.tower, e.target);
        break;
      case 'pulse': {
        const ring = this.add.circle(sx(e.tower.x), sy(e.tower.y), 10).setStrokeStyle(3, 0x90e0ef, 0.9).setDepth(40);
        this.tweens.add({ targets: ring, radius: e.tower.def.range, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        break;
      }
      case 'hit':
        if (e.effect === 'strong') this.floatText(sx(e.monster.x), sy(e.monster.y) - e.monster.radius, `${Math.round(e.amount)}!`, COLORS.strong);
        else if (e.effect === 'weak') this.floatText(sx(e.monster.x), sy(e.monster.y) - e.monster.radius, `${Math.round(e.amount)}`, COLORS.weak, 11);
        break;
      case 'reflect':
        this.floatText(sx(e.monster.x), sy(e.monster.y) - e.monster.radius - 6, 'REFLECT', '#7df9ff', 12);
        break;
      case 'shield': {
        const v = this.monsterViews.get(e.monster.id);
        v?.shield?.destroy();
        if (v) v.shield = null;
        this.floatText(sx(e.monster.x), sy(e.monster.y) - e.monster.radius - 6, 'BLOCKED', '#ffffff', 12);
        break;
      }
      case 'heal':
        this.floatText(sx(e.monster.x), sy(e.monster.y) - e.monster.radius - 6, '+cope', '#7cff9b', 12);
        break;
      case 'blink':
        this.floatText(sx(e.monster.x), sy(e.monster.y), 'blink', '#d9c6ff', 11);
        break;
      case 'stun':
        this.floatText(sx(e.tower.x), sy(e.tower.y) - 26, 'STUNNED', '#ffd166', 12);
        break;
      case 'death':
        this.deathFx(e.monster);
        this.removeMonsterView(e.monster.id);
        if (e.monster.bounty > 1) this.floatText(sx(e.monster.x), sy(e.monster.y) - 8, `+${e.monster.bounty}`, COLORS.gold, 12);
        break;
      case 'leak': {
        this.removeMonsterView(e.monster.id);
        this.cameras.main.shake(140, 0.004);
        const base = this.match.world.map.base;
        this.floatText(sx(base.x), sy(base.y) - 30, `-${e.monster.livesCost} ♥`, COLORS.lives, 16);
        break;
      }
    }
  }

  private shotFx(t: Tower, target: Monster): void {
    const view = this.towerViews.get(t.id);
    if (view) this.tweens.add({ targets: view, scale: 1.02, duration: 60, yoyo: true });
    if (t.def.kind === 'pierce') {
      const line = this.add.line(0, 0, sx(t.x), sy(t.y) - 10, sx(target.x), sy(target.y), 0xbdeeff, 0.9).setOrigin(0).setLineWidth(2).setDepth(40);
      this.tweens.add({ targets: line, alpha: 0, duration: 110, onComplete: () => line.destroy() });
    } else {
      const boom = this.add.circle(sx(target.x), sy(target.y), t.def.splash ?? 30, 0xf8961e, 0.28).setStrokeStyle(3, 0xffc078, 0.9).setDepth(40).setScale(0.4);
      this.tweens.add({ targets: boom, scale: 1, alpha: 0, duration: 260, onComplete: () => boom.destroy() });
    }
  }

  private deathFx(m: Monster): void {
    const color = m.genome.source === 'wilds' ? 0x9fc3b0 : 0xffffff;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const dot = this.add.circle(sx(m.x), sy(m.y), 3 + (i % 3), color, 0.9).setDepth(41);
      this.tweens.add({
        targets: dot,
        x: sx(m.x) + Math.cos(a) * (m.radius + 14),
        y: sy(m.y) + Math.sin(a) * (m.radius + 14),
        alpha: 0,
        duration: 320,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, message: string, color: string, size = 14): void {
    if (this.floaters > 45) return;
    this.floaters++;
    const t = this.add
      .text(x, y, message, text({ fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3 }))
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - 26,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        t.destroy();
        this.floaters--;
      },
    });
  }

  private flash(message: string): void {
    this.toast?.destroy();
    this.toast = this.add
      .text(LAYOUT.panelX / 2, LAYOUT.bottomY - 24, message, text({ fontSize: '16px', fontStyle: 'bold', color: '#ff8fa3', stroke: '#000000', strokeThickness: 4 }))
      .setOrigin(0.5)
      .setDepth(95);
    const t = this.toast;
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300, onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- monsters

  private createMonsterView(m: Monster): void {
    const g: Genome = m.genome;
    const tex = monsterTexture(this, g);
    const root = this.add.container(sx(m.x), sy(m.y)).setDepth(20);
    const bodyRoot = this.add.container(0, 0);
    const sprite = this.add.image(0, 0, tex.key).setOrigin(tex.originX, tex.originY);
    bodyRoot.add(sprite);
    bodyRoot.setScale(m.order.scale);

    let face: Phaser.GameObjects.Image | null = null;
    if (g.emote) {
      const key = this.emoteKey(g.emote);
      const attach = () => {
        if (!root.active || face) return;
        face = this.add.image(g.look.radius * 0.08, -g.look.radius * 0.05, key).setDisplaySize(g.look.radius * 1.45, g.look.radius * 1.45);
        bodyRoot.add(face);
        const v = this.monsterViews.get(m.id);
        if (v) v.face = face;
      };
      if (this.textures.exists(key)) attach();
      else {
        this.ensureEmote(g.emote);
        this.load.once(`filecomplete-image-${key}`, attach);
      }
    }

    const wild = g.source === 'wilds';
    const labelText = wild ? `⟡ ${g.token}` : m.order.copies > 1 ? `${g.token} ×${m.order.copies}` : g.token;
    const label = this.add
      .text(0, -m.radius - 10, labelText, text({ fontSize: wild ? '11px' : '13px', fontStyle: 'bold', color: wild ? COLORS.wildsText : '#ffffff', stroke: '#000000', strokeThickness: 4 }))
      .setOrigin(0.5, 1)
      // Wilds are marked by their glitchy look. Hiding their names keeps chat's words readable.
      .setVisible(!wild);
    const hpBg = this.add.rectangle(-16, -m.radius - 7, 32, 4, 0x000000, 0.7).setOrigin(0, 0.5).setVisible(false);
    const hpFill = this.add.rectangle(-16, -m.radius - 7, 32, 4, 0x7cff9b).setOrigin(0, 0.5).setVisible(false);
    root.add([bodyRoot, hpBg, hpFill, label]);

    let shield: Phaser.GameObjects.Arc | null = null;
    if (m.shieldUp) {
      shield = this.add.circle(0, 0, m.radius + 6).setStrokeStyle(2.5, 0xffffff, 0.85);
      root.add(shield);
    }
    if (!wild && m.order.sender && this.settings.showNames && m.order.cost > 0) {
      root.add(this.add.text(0, m.radius + 4, m.order.sender, text({ fontSize: '10px', color: '#d9c6ff', stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0));
    }

    root.setScale(0.3);
    this.tweens.add({ targets: root, scale: 1, duration: 200, ease: 'Back.Out' });
    this.monsterViews.set(m.id, { root, bodyRoot, sprite, face, label, hpBg, hpFill, shield, lastX: m.x });
  }

  private removeMonsterView(id: number): void {
    const v = this.monsterViews.get(id);
    if (!v) return;
    v.root.destroy();
    this.monsterViews.delete(id);
  }

  private syncMonsters(): void {
    const w = this.match.world;
    for (const m of w.monsters) {
      const v = this.monsterViews.get(m.id);
      if (!v) continue;
      v.root.setPosition(sx(m.x), sy(m.y));
      v.root.setDepth(20 + m.y / 1000);
      const dx = m.x - v.lastX;
      if (Math.abs(dx) > 0.05) v.bodyRoot.scaleX = Math.sign(dx) * m.order.scale;
      v.lastX = m.x;

      const bounce = m.genome.quirks.includes('rhythm') ? 5 : 1.6;
      v.sprite.y = -Math.abs(Math.sin(m.age * 8 + m.genome.look.phase)) * bounce;
      if (v.face) v.face.y = v.sprite.y - m.genome.look.radius * 0.05;

      if (w.time < m.slowUntil) v.sprite.setTint(0xa8e4ff);
      else if (m.genome.quirks.includes('enraged') && m.hp < m.maxHp * 0.6) v.sprite.setTint(0xff9a9a);
      else v.sprite.clearTint();
      v.root.setAlpha(m.genome.quirks.includes('drowsy') ? 0.7 : 1);

      if (m.hp < m.maxHp) {
        const frac = Math.max(0, m.hp / m.maxHp);
        v.hpBg.setVisible(true);
        v.hpFill.setVisible(true).setSize(32 * frac, 4);
        v.hpFill.setFillStyle(frac > 0.5 ? 0x7cff9b : frac > 0.25 ? 0xffd166 : 0xff5c7a);
      }
    }
  }

  private syncStuns(): void {
    const time = this.match.world.time;
    for (const t of this.match.world.towers) {
      const view = this.towerViews.get(t.id);
      if (!view) continue;
      const stunned = time < t.stunnedUntil;
      if (stunned) view.setTint(0x888888);
      else view.clearTint();
      if (stunned && !this.stunMarks.has(t.id)) {
        this.stunMarks.set(t.id, this.add.text(sx(t.x), sy(t.y) - 22, '✦✦', text({ fontSize: '14px', color: '#ffd166' })).setOrigin(0.5).setDepth(45));
      } else if (!stunned && this.stunMarks.has(t.id)) {
        this.stunMarks.get(t.id)!.destroy();
        this.stunMarks.delete(t.id);
      }
    }
  }

  // ---------------------------------------------------------------- end of run

  private showEndOverlay(): void {
    const won = this.match.phase === 'won';
    const c = this.add.container(0, 0).setDepth(200);
    c.add(this.add.rectangle(0, 0, LAYOUT.width, LAYOUT.height, 0x0b0916, 0.78).setOrigin(0));
    c.add(
      this.add
        .text(LAYOUT.panelX / 2, 250, won ? 'VICTORY' : 'DEFEATED', text({ fontSize: '72px', fontStyle: 'bold', color: won ? COLORS.gold : COLORS.lives, stroke: '#000000', strokeThickness: 8 }))
        .setOrigin(0.5),
    );
    const t = this.match.totals;
    const total = t.chat + t.wilds || 1;
    const lines = [
      won ? `The base held through all ${BALANCE.totalWaves} waves.` : `The base fell on wave ${this.match.wave}.`,
      `Chat sent ${Math.round((t.chat / total) * 100)}% of the threat. The Wilds sent ${Math.round((t.wilds / total) * 100)}%.`,
      'Press R to play again.',
    ];
    c.add(this.add.text(LAYOUT.panelX / 2, 340, lines.join('\n'), text({ fontSize: '20px', align: 'center', lineSpacing: 10 })).setOrigin(0.5, 0));
    this.overlay = c;
  }
}
