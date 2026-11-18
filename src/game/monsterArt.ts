/**
 * Sticker-style monster textures, drawn procedurally from the genome and cached per species.
 * Spiky words get star outlines, round words get soft blobs, syllables add tail segments,
 * vowels add eyes, consonant clusters add horns. A word's family adds a body plan around that shape
 * (legs, wheels, a halo, frosting) without changing the outline, so the shape counter stays readable.
 * Chat monsters get a white sticker border, elites a gold one, and Wilds monsters a glitchy magenta and cyan edge.
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
  const family = genome.family;
  const pad = 8 + (family ? R * 0.35 : 0);
  const hornRoom = Math.max(L.horns ? R * 0.55 : 0, family === 'abstract' || family === 'elemental' ? R * 0.5 : 0);
  const footRoom = family ? R * 0.45 : 0;
  const w = Math.ceil(R * 2 + tail + pad * 2 + 6);
  const h = Math.ceil(R * 2 + pad * 2 + hornRoom + footRoom + 6);
  const cx = pad + tail + R + 3;
  const cy = pad + hornRoom + R + 3;

  const wild = genome.source === 'wilds';
  const elite = genome.rarity === 'elite';
  const body = hsl(L.hue, L.saturation, L.lightness);
  const dark = hsl(L.hue, L.saturation, L.lightness * 0.62);
  const light = hsl(L.hue, L.saturation * 0.8, Math.min(0.92, L.lightness + 0.22));
  const border = elite ? COLORS.elite : COLORS.outline;

  const g = scene.make.graphics({}, false);

  // Ground shadow. Floating families cast a smaller shadow further down.
  const floats = family === 'body' || family === 'elemental' || family === 'abstract';
  g.fillStyle(0x000000, floats ? 0.18 : 0.28);
  if (floats) g.fillEllipse(cx - tail / 2, cy + R * 1.3, R * 1.2 + tail, R * 0.3);
  else g.fillEllipse(cx - tail / 2, cy + R * 0.92, R * 1.8 + tail, R * 0.45);

  const palette = { body, dark, light, border, wild };
  if (family) drawPlanBehind(g, genome, cx, cy, R, palette);

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

  if (family) drawPlanOnBody(g, genome, cx, cy, R, palette);
  if (!genome.emote && !genome.emoji) drawFace(g, genome, cx, cy, R);
  if (family === 'meme' && !genome.emote && !genome.emoji) drawShades(g, genome, cx, cy, R);

  g.generateTexture(key, w, h);
  g.destroy();
  const tex = { key, originX: cx / w, originY: cy / h };
  cache.set(key, tex);
  return tex;
}

interface Palette {
  body: number;
  dark: number;
  light: number;
  border: number;
  wild: boolean;
}

/** Family parts that sit behind the body: legs, wheels, terrain, wisps, sound arcs. */
function drawPlanBehind(g: Phaser.GameObjects.Graphics, genome: Genome, cx: number, cy: number, R: number, p: Palette): void {
  const base = cy + R * 0.78;
  const legTop = cy + R * 0.55;
  switch (genome.family) {
    case 'beast':
      for (const dx of [-0.6, -0.22, 0.22, 0.6]) {
        g.fillStyle(p.border, 1);
        g.fillRoundedRect(cx + dx * R - R * 0.15 - 2.5, legTop - 2.5, R * 0.3 + 5, R * 0.62 + 5, 5);
        g.fillStyle(p.dark, 1);
        g.fillRoundedRect(cx + dx * R - R * 0.15, legTop, R * 0.3, R * 0.62, 4);
      }
      break;
    case 'person':
      for (const dx of [-0.3, 0.3]) {
        g.fillStyle(p.border, 1);
        g.fillRoundedRect(cx + dx * R - R * 0.13 - 2.5, legTop - 2.5, R * 0.26 + 5, R * 0.72 + 5, 5);
        g.fillStyle(p.dark, 1);
        g.fillRoundedRect(cx + dx * R - R * 0.13, legTop, R * 0.26, R * 0.72, 4);
      }
      for (const side of [-1, 1]) {
        g.lineStyle(R * 0.2 + 3, p.border, 1);
        g.lineBetween(cx + side * R * 0.8, cy, cx + side * R * 1.2, cy + R * 0.35);
        g.lineStyle(R * 0.2, p.dark, 1);
        g.lineBetween(cx + side * R * 0.8, cy, cx + side * R * 1.2, cy + R * 0.35);
      }
      break;
    case 'construct':
      for (const dx of [-0.5, 0.5]) {
        g.fillStyle(p.border, 1);
        g.fillCircle(cx + dx * R, base + R * 0.08, R * 0.3 + 2.5);
        g.fillStyle(COLORS.ink, 1);
        g.fillCircle(cx + dx * R, base + R * 0.08, R * 0.3);
        g.fillStyle(0x9a9ab0, 1);
        g.fillCircle(cx + dx * R, base + R * 0.08, R * 0.12);
      }
      break;
    case 'place':
      g.fillStyle(p.border, 1);
      g.fillRoundedRect(cx - R * 1.1 - 2, base - R * 0.1 - 2, R * 2.2 + 4, R * 0.42 + 4, 6);
      g.fillStyle(0x6b5a4a, 1);
      g.fillRoundedRect(cx - R * 1.1, base - R * 0.1, R * 2.2, R * 0.42, 5);
      g.fillStyle(0x5aa05a, 1);
      g.fillRect(cx - R * 1.1, base - R * 0.1, R * 2.2, R * 0.1);
      break;
    case 'elemental':
      for (let i = 0; i < 3; i++) {
        const fx = cx + (i - 1) * R * 0.5;
        g.fillStyle(p.light, 0.85);
        g.fillTriangle(fx - R * 0.28, cy - R * 0.4, fx + R * 0.28, cy - R * 0.4, fx + (i - 1) * R * 0.2, cy - R * (1.45 + (i % 2) * 0.25));
      }
      break;
    case 'sound':
      g.lineStyle(3, 0xffffff, 0.85);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          const r = R * (1.12 + k * 0.22);
          const start = side > 0 ? -0.45 : Math.PI - 0.45;
          g.arc(cx, cy, r, start, start + 0.9, false);
          g.strokePath();
        }
      }
      break;
    default:
      break;
  }
}

/** Family details drawn on top of the body, under the face. */
function drawPlanOnBody(g: Phaser.GameObjects.Graphics, genome: Genome, cx: number, cy: number, R: number, p: Palette): void {
  switch (genome.family) {
    case 'construct':
      g.fillStyle(p.dark, 0.9);
      g.fillRect(cx - R * 0.75, cy + R * 0.12, R * 1.5, R * 0.16);
      g.fillStyle(0xd8d8e8, 1);
      for (const dx of [-0.55, -0.18, 0.18, 0.55]) g.fillCircle(cx + dx * R, cy + R * 0.2, Math.max(1.5, R * 0.05));
      break;
    case 'food': {
      g.fillStyle(0xfff3f8, 0.95);
      g.fillEllipse(cx - R * 0.05, cy - R * 0.62, R * 1.3, R * 0.42);
      for (const dx of [-0.45, 0, 0.42]) g.fillCircle(cx + dx * R, cy - R * 0.45 + Math.abs(dx) * R * 0.2, R * 0.12);
      const sprinkles = [0xff5c7a, 0x4cc9f0, 0xffd166, 0x7cff9b];
      sprinkles.forEach((c, i) => {
        g.fillStyle(c, 1);
        g.fillRect(cx - R * 0.45 + i * R * 0.28, cy - R * (0.72 - (i % 2) * 0.1), Math.max(2, R * 0.12), Math.max(1.5, R * 0.05));
      });
      break;
    }
    case 'place':
      g.fillStyle(0x5aa05a, 1);
      g.fillTriangle(cx - R * 0.35, cy - R * 0.7, cx - R * 0.15, cy - R * 0.7, cx - R * 0.25, cy - R * 1.05);
      g.fillTriangle(cx + R * 0.1, cy - R * 0.75, cx + R * 0.32, cy - R * 0.75, cx + R * 0.21, cy - R * 1.15);
      break;
    case 'abstract':
      g.lineStyle(3, COLORS.elite, 0.9);
      g.strokeEllipse(cx, cy - R * 1.12, R * 1.1, R * 0.3);
      break;
    case 'body':
      g.lineStyle(1.5, p.dark, 0.7);
      g.beginPath();
      g.arc(cx - R * 0.4, cy + R * 0.3, R * 0.3, 0.2, 2.2, false);
      g.strokePath();
      break;
    default:
      break;
  }
}

/** Meme family: deal-with-it shades. */
function drawShades(g: Phaser.GameObjects.Graphics, genome: Genome, cx: number, cy: number, R: number): void {
  const n = Math.min(genome.look.eyes, 2);
  const ey = cy - R * 0.14;
  const lensW = R * 0.42;
  const lensH = R * 0.26;
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(cx - R * 0.55, ey - lensH * 0.15, R * 1.2, Math.max(2, R * 0.06));
  for (let i = 0; i < n; i++) {
    const lx = cx - R * 0.42 + i * R * 0.55;
    g.fillRect(lx, ey - lensH / 2, lensW, lensH);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(lx + lensW * 0.15, ey - lensH * 0.35, lensW * 0.2, lensH * 0.2);
    g.fillStyle(COLORS.ink, 1);
  }
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
