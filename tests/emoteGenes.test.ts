import { describe, expect, it } from 'vitest';
import { makeGenome } from '../src/genome';
import { analyzeEmotePixels, setEmoteGenes } from '../src/genome/emoteGenes';

/** Paints a width x height RGBA image with a color wherever inside(x, y) is true. */
function paint(width: number, height: number, rgb: [number, number, number], inside: (x: number, y: number) => boolean): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      const i = (y * width + x) * 4;
      px.set([...rgb, 255], i);
    }
  }
  return px;
}

const disk = (x: number, y: number) => Math.hypot(x - 16, y - 16) < 12;
const star = (x: number, y: number) => {
  const a = Math.atan2(y - 16, x - 16);
  return Math.hypot(x - 16, y - 16) < 6 + 9 * Math.abs(Math.cos(a * 4));
};

describe('emote image analysis', () => {
  it('reads palette as element', () => {
    expect(analyzeEmotePixels(paint(32, 32, [230, 60, 30], disk), 32, 32).element).toBe('fire');
    expect(analyzeEmotePixels(paint(32, 32, [40, 140, 240], disk), 32, 32).element).toBe('frost');
    expect(analyzeEmotePixels(paint(32, 32, [60, 200, 70], disk), 32, 32).element).toBe('venom');
    expect(analyzeEmotePixels(paint(32, 32, [150, 60, 220], disk), 32, 32).element).toBe('spirit');
    expect(analyzeEmotePixels(paint(32, 32, [128, 128, 128], disk), 32, 32).element).toBe('stone');
  });

  it('reads a smooth outline as round and a jagged one as spiky', () => {
    const round = analyzeEmotePixels(paint(32, 32, [230, 60, 30], disk), 32, 32);
    const spiky = analyzeEmotePixels(paint(32, 32, [230, 60, 30], star), 32, 32);
    expect(round.sharpness!).toBeLessThan(0);
    expect(spiky.sharpness!).toBeGreaterThan(round.sharpness!);
  });

  it('ignores shape for full-bleed square emotes', () => {
    const square = analyzeEmotePixels(paint(32, 32, [230, 60, 30], () => true), 32, 32);
    expect(square.sharpness).toBeNull();
    expect(square.element).toBe('fire');
  });

  it('reads wide silhouettes', () => {
    const wide = analyzeEmotePixels(paint(32, 32, [230, 60, 30], (_x, y) => y > 10 && y < 20), 32, 32);
    expect(wide.silhouette).toBe('wide');
  });

  it('feeds the genome: palette sets element and body hue', () => {
    const emote = { provider: '7tv' as const, id: 'test-blue', url: '' };
    const before = makeGenome('zzBlob', { emote })!;
    setEmoteGenes('test-blue', { element: 'frost', hue: 200, sharpness: -0.5, silhouette: 'round' });
    const after = makeGenome('zzBlob', { emote })!;
    expect(after.element).toBe('frost');
    expect(after.look.hue).toBe(200);
    expect(after.key).toBe(before.key);
  });
});
