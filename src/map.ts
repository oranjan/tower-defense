import { COLS, ROWS, TILE } from './config';

// Path waypoints in tile coordinates. Starts off-map on the left, ends on the base tile.
const WAYPOINTS: [number, number][] = [
  [-1, 2], [19, 2], [19, 6], [4, 6], [4, 10], [21, 10], [21, 12],
];

export const PATH = WAYPOINTS.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
export const SEG_LEN: number[] = [];
export const CUM_LEN: number[] = [0];
for (let i = 0; i < PATH.length - 1; i++) {
  const l = Math.hypot(PATH[i + 1].x - PATH[i].x, PATH[i + 1].y - PATH[i].y);
  SEG_LEN.push(l);
  CUM_LEN.push(CUM_LEN[i] + l);
}
export const PATH_LEN = CUM_LEN[CUM_LEN.length - 1];

export const BASE_COL = WAYPOINTS[WAYPOINTS.length - 1][0];
export const BASE_ROW = WAYPOINTS[WAYPOINTS.length - 1][1];

// 0 = grass (buildable), 1 = path, 2 = base
export const TILE_KIND = new Uint8Array(COLS * ROWS);
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  let [c, r] = WAYPOINTS[i];
  const [c2, r2] = WAYPOINTS[i + 1];
  const dc = Math.sign(c2 - c), dr = Math.sign(r2 - r);
  for (;;) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) TILE_KIND[r * COLS + c] = 1;
    if (c === c2 && r === r2) break;
    c += dc;
    r += dr;
  }
}
TILE_KIND[BASE_ROW * COLS + BASE_COL] = 2;

export function inBounds(c: number, r: number) {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

// Position at distance s along the path. Linear scan over segments.
export function pointAt(s: number, out: { x: number; y: number }) {
  if (s <= 0) {
    out.x = PATH[0].x;
    out.y = PATH[0].y;
    return;
  }
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (s <= CUM_LEN[i + 1]) {
      const t = (s - CUM_LEN[i]) / SEG_LEN[i];
      out.x = PATH[i].x + (PATH[i + 1].x - PATH[i].x) * t;
      out.y = PATH[i].y + (PATH[i + 1].y - PATH[i].y) * t;
      return;
    }
  }
  const last = PATH[PATH.length - 1];
  out.x = last.x;
  out.y = last.y;
}
