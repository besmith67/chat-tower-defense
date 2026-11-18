/**
 * Maps. Two portals, one for chat and one for the Wilds, merge into a shared road that winds to
 * the base. Tiles are [col, row]; paths are in pixels inside the play area.
 */
import { Path, type Point } from './path';

export const TILE = 40;
export const COLS = 25;
export const ROWS = 15;
export const PLAY_WIDTH = COLS * TILE;
export const PLAY_HEIGHT = ROWS * TILE;

export type PortalId = 'chat' | 'wilds';

type Tile = [col: number, row: number];

/**
 * A map is two roads, one from each portal, that meet at a junction and share the rest of the way
 * to the base. Each start ends at the junction, which is also where the shared road begins.
 */
export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  chat: Tile[];
  wilds: Tile[];
  shared: Tile[];
  /** Multiplies monster health, so long and short maps play about as hard. Gold is unaffected. */
  toughness: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'switchback',
    name: 'Switchback',
    blurb: 'Both portals meet early, then the road winds the long way to the base.',
    chat: [[-1, 2], [4, 2], [4, 7]],
    wilds: [[-1, 12], [4, 12], [4, 7]],
    shared: [[4, 7], [9, 7], [9, 2], [15, 2], [15, 12], [20, 12], [20, 6], [24, 6]],
    toughness: 1,
  },
  {
    id: 'twin',
    name: 'Twin Lanes',
    blurb: 'Chat and the Wilds zigzag down separate lanes and only meet at the gate.',
    chat: [[-1, 1], [4, 1], [4, 5], [9, 5], [9, 1], [14, 1], [14, 5], [19, 5], [19, 1], [22, 1], [22, 7]],
    wilds: [[-1, 12], [4, 12], [4, 8], [9, 8], [9, 12], [14, 12], [14, 8], [19, 8], [19, 12], [22, 12], [22, 7]],
    shared: [[22, 7], [24, 7]],
    toughness: 0.75,
  },
  {
    id: 'spiral',
    name: 'Spiral',
    blurb: 'One road coils inward to a base in the middle. Towers in the center reach many turns.',
    chat: [[-1, 2], [2, 2]],
    wilds: [[-1, 12], [2, 12], [2, 2]],
    shared: [[2, 2], [21, 2], [21, 12], [6, 12], [6, 6], [16, 6], [16, 9], [12, 9]],
    toughness: 1.3,
  },
];

export function getMap(id: string | undefined): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

function center([col, row]: Tile): Point {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function route(start: Tile[], shared: Tile[]): Point[] {
  return [...start, ...shared.slice(1)].map(center);
}

export interface GameMap {
  def: MapDef;
  paths: Record<PortalId, Path>;
  pathTiles: Set<string>;
  base: Point;
  portals: Record<PortalId, Point>;
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function createMap(def: MapDef = MAPS[0]): GameMap {
  const pathTiles = new Set<string>();
  for (const tiles of [[...def.chat, ...def.shared], [...def.wilds, ...def.shared]]) {
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
    def,
    paths: { chat: new Path(route(def.chat, def.shared)), wilds: new Path(route(def.wilds, def.shared)) },
    pathTiles,
    base: center(def.shared[def.shared.length - 1]),
    portals: { chat: center([0, def.chat[0][1]]), wilds: center([0, def.wilds[0][1]]) },
  };
}
