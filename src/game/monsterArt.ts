/**
 * Sticker-style monster textures, drawn procedurally from the genome and cached per species.
 * Spiky words get star outlines, round words get soft blobs, syllables add tail segments,
 * vowels add eyes, consonant clusters add horns. Chat monsters get a white sticker border,
 * elites a gold one, and Wilds monsters a glitchy magenta and cyan edge.
 */
import Phaser from 'phaser';
import type { Genome } from '../genome';
import { COLORS, hsl } from './theme';

export interface MonsterTexture {
  key: string;
  originX: number;
  originY: number;
}

const cache = new Map<string, MonsterTexture>();

export function monsterTexture(scene: Phaser.Scene, genome: Genome): MonsterTexture {
  const key = `mon:${genome.key}:${genome.look.radius.toFixed(1)}`;
  const cached = cache.get(key);
  if (cached && scene.textures.exists(key)) return cached;

  const L = genome.look;
  const R = L.radius;
  const segR = R * 0.62;
  const tail = L.segments * segR * 1.05;
  const pad = 8;
  const hornRoom = L.horns ? R * 0.55 : 0;
  const w = Math.ceil(R * 2 + tail + pad * 2 + 6);
  const h = Math.ceil(R * 2 + pad * 2 + hornRoom + 6);
  const cx = pad + tail + R + 3;
  const cy = pad + hornRoom + R + 3;

  const wild = genome.source === 'wilds';
  const elite = genome.rarity === 'elite';
  const body = hsl(L.hue, L.saturation, L.lightness);
  const dark = hsl(L.hue, L.saturation, L.lightness * 0.62);
  const light = hsl(L.hue, L.saturation * 0.8, Math.min(0.92, L.lightness + 0.22));
  const border = elite ? COLORS.elite : COLORS.outline;

  const g = scene.make.graphics({}, false);

  // Ground shadow.
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(cx - tail / 2, cy + R * 0.92, R * 1.8 + tail, R * 0.45);

  // Tail segments, farthest first.
  for (let i = L.segments - 1; i >= 0; i--) {
    const sx = cx - R * 0.78 - i * segR * 1.05;
    const sy = cy + R * 0.22 + Math.sin(L.phase + i) * 2;
    const sr = segR * (1 - i * 0.12);
    outlineCircle(g, sx, sy, sr, wild, border);
    g.fillStyle(dark, 1);
    g.fillCircle(sx, sy, sr);
    g.fillStyle(body, 1);
    g.fillCircle(sx - sr * 0.12, sy - sr * 0.15, sr * 0.78);
  }

  // Horns, behind the body.
  for (let i = 0; i < L.horns; i++) {
    const t = L.horns === 1 ? 0 : (i / (L.horns - 1) - 0.5) * 1.1;
    const angle = -Math.PI / 2 + t;
    const bx = cx + Math.cos(angle) * R * 0.8;
    const by = cy + Math.sin(angle) * R * 0.8;
    const tx = cx + Math.cos(angle) * R * 1.5;
    const ty = cy + Math.sin(angle) * R * 1.5;
    const nx = -Math.sin(angle) * R * 0.22;
    const ny = Math.cos(angle) * R * 0.22;
    if (!wild) {
      g.fillStyle(border, 1);
      g.fillTriangle(bx - nx * 1.5, by - ny * 1.5, bx + nx * 1.5, by + ny * 1.5, tx + Math.cos(angle) * 4, ty + Math.sin(angle) * 4);
    }
    g.fillStyle(light, 1);
    g.fillTriangle(bx - nx, by - ny, bx + nx, by + ny, tx, ty);
  }

  // Body.
  const outline = bodyPoints(genome, cx, cy, R + 3.5);
  const inner = bodyPoints(genome, cx, cy, R);
  if (wild) {
    g.fillStyle(0xff2bd6, 0.75);
    g.fillPoints(shift(outline, -2.5, 0), true);
    g.fillStyle(0x2bfff0, 0.75);
    g.fillPoints(shift(outline, 2.5, 0), true);
  } else {
    g.fillStyle(border, 1);
    g.fillPoints(outline, true);
  }
  g.fillStyle(dark, 1);
  g.fillPoints(inner, true);
  g.fillStyle(body, 1);
  g.fillPoints(bodyPoints(genome, cx - R * 0.06, cy - R * 0.1, R * 0.86), true);
  g.fillStyle(0xffffff, 0.28);
  g.fillEllipse(cx - R * 0.35, cy - R * 0.45, R * 0.6, R * 0.32);

  if (wild) {
    // Scanlines make the Wilds read as generated, not chat-made.
    g.fillStyle(0x000000, 0.22);
    for (let y = cy - R; y < cy + R; y += 4) g.fillRect(cx - R, y, R * 2, 1.5);
  }

  if (!genome.emote) drawFace(g, genome, cx, cy, R);

  g.generateTexture(key, w, h);
  g.destroy();
  const tex = { key, originX: cx / w, originY: cy / h };
  cache.set(key, tex);
  return tex;
}

function outlineCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, wild: boolean, border: number): void {
  if (wild) {
    g.fillStyle(0xff2bd6, 0.75);
    g.fillCircle(x - 2, y, r + 2.5);
    g.fillStyle(0x2bfff0, 0.75);
    g.fillCircle(x + 2, y, r + 2.5);
  } else {
    g.fillStyle(border, 1);
    g.fillCircle(x, y, r + 3.5);
  }
}

function bodyPoints(genome: Genome, cx: number, cy: number, r: number): Phaser.Math.Vector2[] {
  const L = genome.look;
  const s = genome.form.sharpness;
  const pts: Phaser.Math.Vector2[] = [];
  const samples = 72;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    let rr = r;
    if (s > 0.1) {
      // Star: triangle wave between spike tips and valleys.
      const depth = 0.1 + 0.32 * s;
      const t = (a / (Math.PI * 2)) * L.points;
      const tri = Math.abs(((t % 1) + 1) % 1 - 0.5) * 2;
      rr = r * (1 - depth * tri);
    } else {
      // Blob: soft wobble that grows rounder and lumpier as the word gets softer.
      const lump = 0.05 + 0.05 * Math.max(0, -s);
      rr = r * (1 + lump * Math.sin(a * 3 + L.phase) + lump * 0.6 * Math.sin(a * 5 - L.phase));
    }
    // Squash slightly so monsters sit on the ground.
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92));
  }
  return pts;
}

function shift(points: Phaser.Math.Vector2[], dx: number, dy: number): Phaser.Math.Vector2[] {
  return points.map((p) => new Phaser.Math.Vector2(p.x + dx, p.y + dy));
}

function drawFace(g: Phaser.GameObjects.Graphics, genome: Genome, cx: number, cy: number, R: number): void {
  const n = genome.look.eyes;
  const q = genome.quirks;
  const eyeR = R * (n <= 2 ? 0.25 : n === 3 ? 0.2 : 0.17);
  const spread = eyeR * 2.3;
  const ex0 = cx + R * 0.18 - ((n - 1) * spread) / 2;
  const ey = cy - R * 0.12;

  for (let i = 0; i < n; i++) {
    const ex = ex0 + i * spread;
    const eyBob = (i % 2) * eyeR * 0.25;
    const r = q.includes('mocking') && i === 0 ? eyeR * 1.3 : eyeR;
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(ex, ey + eyBob, r + 1.6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex, ey + eyBob, r);
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(ex + r * 0.35, ey + eyBob + r * 0.1, r * 0.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex + r * 0.5, ey + eyBob - r * 0.12, r * 0.16);

    if (q.includes('drowsy')) {
      g.fillStyle(hsl(genome.look.hue, genome.look.saturation, genome.look.lightness), 1);
      g.fillRect(ex - r - 2, ey + eyBob - r - 2, r * 2 + 4, r + 1);
    }
    if (q.includes('enraged')) {
      g.lineStyle(2.5, COLORS.ink, 1);
      g.lineBetween(ex - r, ey + eyBob - r * 1.3, ex + r, ey + eyBob - r * 0.7);
    }
  }

  // Mouth: jagged teeth for spiky words, a soft smile for round ones.
  const my = cy + R * 0.38;
  const mw = R * 0.55;
  const mx = cx + R * 0.12;
  if (genome.formClass === 'spiky') {
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(mx - mw / 2, my - 3, mw, 7);
    g.fillStyle(0xffffff, 1);
    const teeth = 4;
    for (let i = 0; i < teeth; i++) {
      const tx = mx - mw / 2 + (i + 0.5) * (mw / teeth);
      g.fillTriangle(tx - mw / teeth / 2 + 0.5, my - 3, tx + mw / teeth / 2 - 0.5, my - 3, tx, my + 2);
    }
  } else {
    g.lineStyle(2.5, COLORS.ink, 1);
    g.beginPath();
    g.arc(mx, my - R * 0.12, mw / 2, Math.PI * 0.15, Math.PI * 0.85, false);
    g.strokePath();
  }
}

export function towerTextures(scene: Phaser.Scene): void {
  const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, 48, 48);
    g.destroy();
  };
  const plate = (g: Phaser.GameObjects.Graphics, color: number) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(6, 10, 38, 36, 8);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(3, 5, 42, 40, 9);
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(6, 8, 36, 34, 7);
    g.fillStyle(color, 0.25);
    g.fillRoundedRect(6, 8, 36, 34, 7);
  };
  make('tower-needle', (g) => {
    plate(g, 0x4cc9f0);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(24, 2, 13, 40, 35, 40);
    g.fillStyle(0x4cc9f0, 1);
    g.fillTriangle(24, 7, 16, 37, 32, 37);
    g.fillStyle(0xbdeeff, 1);
    g.fillTriangle(24, 7, 20, 37, 24, 37);
  });
  make('tower-hammer', (g) => {
    plate(g, 0xf8961e);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(9, 11, 30, 26, 6);
    g.fillStyle(0xf8961e, 1);
    g.fillRoundedRect(12, 14, 24, 20, 4);
    g.fillStyle(0x9c4f00, 1);
    g.fillRect(12, 22, 24, 4);
  });
  make('tower-frost', (g) => {
    plate(g, 0x90e0ef);
    const hex = (r: number) =>
      Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(24 + Math.cos((i * Math.PI) / 3 + Math.PI / 6) * r, 25 + Math.sin((i * Math.PI) / 3 + Math.PI / 6) * r));
    g.fillStyle(0xffffff, 1);
    g.fillPoints(hex(16), true);
    g.fillStyle(0x90e0ef, 1);
    g.fillPoints(hex(13), true);
    g.fillStyle(0xe6fbff, 1);
    g.fillPoints(hex(6), true);
  });
  make('tower-flame', (g) => {
    plate(g, 0xff6b35);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 29, 12);
    g.fillTriangle(12, 28, 24, 4, 36, 28);
    g.fillStyle(0xff6b35, 1);
    g.fillCircle(24, 29, 9);
    g.fillTriangle(15, 28, 24, 9, 33, 28);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(24, 31, 5);
    g.fillTriangle(19, 31, 24, 19, 29, 31);
  });
  make('tower-tesla', (g) => {
    plate(g, 0xffe066);
    g.fillStyle(0xffffff, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(28, 4), new Phaser.Math.Vector2(12, 27), new Phaser.Math.Vector2(22, 27),
      new Phaser.Math.Vector2(18, 44), new Phaser.Math.Vector2(37, 19), new Phaser.Math.Vector2(26, 19),
    ], true);
    g.fillStyle(0xffe066, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(26, 9), new Phaser.Math.Vector2(16, 24), new Phaser.Math.Vector2(25, 24),
      new Phaser.Math.Vector2(22, 37), new Phaser.Math.Vector2(33, 22), new Phaser.Math.Vector2(24, 22),
    ], true);
  });
}
