// Uniform spatial grid over the world, rebuilt every tick with a counting sort (no allocation).
// Stores object references so indices never go stale when enemies are removed mid-tick.
import { WORLD_H, WORLD_W } from './config';

const CELL = 64;
const MARGIN = 2; // cells of padding around the world (enemies spawn just off-map)

export class SpatialGrid<T extends { x: number; y: number }> {
  readonly cols = Math.ceil(WORLD_W / CELL) + MARGIN * 2;
  readonly rows = Math.ceil(WORLD_H / CELL) + MARGIN * 2;
  private cellStart: Int32Array;
  private cursor: Int32Array;
  private cellOf: Int32Array;
  private items: (T | null)[];

  constructor(capacity: number) {
    const cells = this.cols * this.rows;
    this.cellStart = new Int32Array(cells + 1);
    this.cursor = new Int32Array(cells);
    this.cellOf = new Int32Array(capacity);
    this.items = new Array(capacity).fill(null);
  }

  private cellIndex(x: number, y: number) {
    let c = Math.floor(x / CELL) + MARGIN;
    let r = Math.floor(y / CELL) + MARGIN;
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return r * this.cols + c;
  }

  rebuild(list: T[]) {
    const n = Math.min(list.length, this.cellOf.length);
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(list[i].x, list[i].y);
      this.cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < this.cursor.length; c++) start[c + 1] += start[c];
    this.cursor.set(start.subarray(0, this.cursor.length));
    for (let i = 0; i < n; i++) this.items[this.cursor[this.cellOf[i]]++] = list[i];
  }

  // Writes every item in cells overlapping the circle's bounding box into `out`; returns the count.
  // Callers do the exact distance test.
  query(x: number, y: number, r: number, out: (T | null)[]) {
    const c0 = Math.max(0, Math.floor((x - r) / CELL) + MARGIN);
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL) + MARGIN);
    const r0 = Math.max(0, Math.floor((y - r) / CELL) + MARGIN);
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL) + MARGIN);
    let n = 0;
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      const from = this.cellStart[base + c0];
      const to = this.cellStart[base + c1 + 1];
      for (let k = from; k < to; k++) out[n++] = this.items[k];
    }
    return n;
  }
}
