// One requestAnimationFrame loop drives the whole game.
// Simulation runs in fixed 1/60 s steps (accumulator), so behaviour is identical on 60/120/144 Hz screens;
// rendering happens once per display frame.

import type { Stats } from './bench/stats';

export const STEP = 1 / 60;
const MAX_STEPS = 8; // 4x speed on a 30 Hz frame; beyond this we drop time instead of spiralling

export interface LoopCallbacks {
  update(dt: number): void;
  render(alpha: number): void; // alpha = how far we are between the last step and the next (0..1)
}

export class Loop {
  speed = 1;
  paused = false;
  private acc = 0;
  private last = -1;

  constructor(private cb: LoopCallbacks, private stats: Stats) {}

  start() {
    requestAnimationFrame(this.frame);
  }

  private frame = (t: number) => {
    requestAnimationFrame(this.frame);
    const interval = this.last < 0 ? 0 : t - this.last;
    this.last = t;
    if (!this.paused) this.acc += Math.min(interval / 1000, 0.25) * this.speed;

    const t0 = performance.now();
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.cb.update(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    const t1 = performance.now();
    this.cb.render(this.acc / STEP);
    const t2 = performance.now();

    this.stats.record(interval, t1 - t0, t2 - t1);
  };
}
