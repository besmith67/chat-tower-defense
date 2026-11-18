/**
 * The first map. Two portals, one for chat and one for the Wilds, merge into a shared road
 * that winds to the base. Coordinates are in pixels inside the play area.
 */
import { Path, type Point } from './path';

export const TILE = 40;
export const COLS = 25;
export const ROWS = 15;
export const PLAY_WIDTH = COLS * TILE;
export const PLAY_HEIGHT = ROWS * TILE;

export type PortalId = 'chat' | 'wilds';

type Tile = [col: number, row: number];

const CHAT_START: Tile[] = [[-1, 2], [4, 2], [4, 7]];
const WILDS_START: Tile[] = [[-1, 12], [4, 12], [4, 7]];
const SHARED: Tile[] = [[4, 7], [9, 7], [9, 2], [15, 2], [15, 12], [20, 12], [20, 6], [24, 6]];

export const BASE_TILE: Tile = [24, 6];

function center([col, row]: Tile): Point {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function route(start: Tile[]): Point[] {
  return [...start, ...SHARED.slice(1)].map(center);
}

export interface GameMap {
  paths: Record<PortalId, Path>;
  pathTiles: Set<string>;
  base: Point;
  portals: Record<PortalId, Point>;
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function createMap(): GameMap {
  const pathTiles = new Set<string>();
  for (const tiles of [[...CHAT_START, ...SHARED], [...WILDS_START, ...SHARED]]) {
    for (let i = 1; i < tiles.length; i++) {
      const [c1, r1] = tiles[i - 1];
      const [c2, r2] = tiles[i];
      const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
      for (let s = 0; s <= steps; s++) {
        const c = c1 + Math.sign(c2 - c1) * s;
        const r = r1 + Math.sign(r2 - r1) * s;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) pathTiles.add(tileKey(c, r));
      }
    }
  }
  return {
    paths: { chat: new Path(route(CHAT_START)), wilds: new Path(route(WILDS_START)) },
    pathTiles,
    base: center(BASE_TILE),
    portals: { chat: center([0, 2]), wilds: center([0, 12]) },
  };
}
