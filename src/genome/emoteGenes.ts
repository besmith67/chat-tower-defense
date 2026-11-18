/**
 * Layer 6: reading an emote's image. The game draws each emote once to a small canvas and passes
 * the pixels here. Palette picks the element and body color, the outline's roughness pushes the
 * form toward spiky or round, and the silhouette's proportions nudge stats.
 *
 * Results are cached by emote id. The generator reads the cache, and the collector refreshes
 * pending emote species when a result arrives, so a species is settled before it spawns.
 */
import type { Element } from './lexiconFormat';

export type Silhouette = 'wide' | 'tall' | 'round';

export interface EmoteGenes {
  element: Element | null;
  /** Dominant hue of the colorful pixels, 0 to 360, or null for a gray image. */
  hue: number | null;
  /** -0.6 (smooth outline) to +0.6 (jagged), or null when the image has no transparent edge. */
  sharpness: number | null;
  silhouette: Silhouette | null;
}

const cache = new Map<string, EmoteGenes>();

export function setEmoteGenes(emoteId: string, genes: EmoteGenes): void {
  cache.set(emoteId, genes);
}

export function getEmoteGenes(emoteId: string): EmoteGenes | undefined {
  return cache.get(emoteId);
}

/** Hue ranges for each element, in degrees. Fire wraps around red. */
const HUE_BINS: [Element, number, number][] = [
  ['fire', 345, 40], ['storm', 40, 70], ['venom', 70, 165], ['frost', 165, 250], ['spirit', 250, 345],
];

function binOf(hue: number): Element {
  for (const [el, from, to] of HUE_BINS) {
    if (from > to ? hue >= from || hue < to : hue >= from && hue < to) return el;
  }
  return 'fire';
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  return [h, s, l];
}

/** Analyzes RGBA pixels, row-major, as returned by a canvas's getImageData. */
export function analyzeEmotePixels(rgba: ArrayLike<number>, width: number, height: number): EmoteGenes {
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && rgba[(y * width + x) * 4 + 3] > 128;

  let area = 0;
  let perimeter = 0;
  let lightSum = 0;
  let colorful = 0;
  let minX = width, maxX = -1, minY = height, maxY = -1;
  const bins = new Map<Element, { count: number; sin: number; cos: number }>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      area++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (!opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) perimeter++;
      const i = (y * width + x) * 4;
      const [h, s, l] = toHsl(rgba[i], rgba[i + 1], rgba[i + 2]);
      lightSum += l;
      if (s > 0.25 && l > 0.15 && l < 0.85) {
        colorful++;
        const el = binOf(h);
        const bin = bins.get(el) ?? { count: 0, sin: 0, cos: 0 };
        bin.count++;
        bin.sin += Math.sin((h * Math.PI) / 180);
        bin.cos += Math.cos((h * Math.PI) / 180);
        bins.set(el, bin);
      }
    }
  }

  if (area < 8) return { element: null, hue: null, sharpness: null, silhouette: null };

  // Palette.
  let element: Element | null = null;
  let hue: number | null = null;
  if (colorful / area < 0.25) {
    element = lightSum / area < 0.25 ? 'spirit' : 'stone';
  } else {
    const [top, bin] = [...bins.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    hue = Math.round(((Math.atan2(bin.sin, bin.cos) * 180) / Math.PI + 360) % 360);
    if (bin.count / colorful >= 0.4) element = top;
  }

  // Shape only means something when the emote has a transparent background.
  const coverage = area / (width * height);
  let sharpness: number | null = null;
  let silhouette: Silhouette | null = null;
  if (coverage < 0.9) {
    // 1 for a disk, higher for a jagged outline.
    const roughness = perimeter / (2 * Math.sqrt(Math.PI * area));
    sharpness = Math.max(-0.6, Math.min(0.6, (roughness - 1.3) * 1.5));
    const aspect = (maxX - minX + 1) / (maxY - minY + 1);
    silhouette = aspect > 1.3 ? 'wide' : aspect < 0.77 ? 'tall' : 'round';
  }
  return { element, hue, sharpness, silhouette };
}
