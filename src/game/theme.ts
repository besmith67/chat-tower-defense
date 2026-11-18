export const FONT = 'Fredoka, "Trebuchet MS", system-ui, sans-serif';

export const COLORS = {
  background: 0x15122a,
  tileA: 0x1d1937,
  tileB: 0x1a1632,
  path: 0x3b3260,
  pathEdge: 0x4d4378,
  panel: 0x100e20,
  panelEdge: 0x2b2550,
  text: '#f4f1ff',
  muted: '#9c95c4',
  gold: '#ffd166',
  lives: '#ff6b8b',
  chat: 0x9146ff,
  chatText: '#b48cff',
  wilds: 0x6f8f7f,
  wildsText: '#9fc3b0',
  strong: '#d8ff5c',
  weak: '#8a86a6',
  outline: 0xffffff,
  elite: 0xffd166,
  ink: 0x17142a,
} as const;

export const LAYOUT = {
  width: 1280,
  height: 720,
  topBar: 48,
  playX: 0,
  playY: 48,
  panelX: 1000,
  bottomY: 648,
} as const;

export function hsl(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
