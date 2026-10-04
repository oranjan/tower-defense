// Frame-time ring buffer. Everything is preallocated so measuring doesn't create garbage itself.

const N = 600; // ~10 s at 60 Hz

export interface StatsSummary {
  fps: number;
  p95: number; // frame interval ms
  p99: number;
  pctOver33: number; // % of frames slower than 33 ms
  pctAt45: number; // % of frames at >= 45 FPS (interval <= 22.2 ms)
  simMs: number; // avg simulation cost per frame
  renderMs: number; // avg render cost per frame
  heapMb: number; // -1 when performance.memory is unavailable
}

export class Stats {
  private intervals = new Float32Array(N);
  private sims = new Float32Array(N);
  private renders = new Float32Array(N);
  private scratch = new Float32Array(N);
  private i = 0;
  private n = 0;

  record(interval: number, simMs: number, renderMs: number) {
    if (interval <= 0) return;
    this.intervals[this.i] = interval;
    this.sims[this.i] = simMs;
    this.renders[this.i] = renderMs;
    this.i = (this.i + 1) % N;
    if (this.n < N) this.n++;
  }

  // FPS over the most recent `frames` frames (~0.5 s at 60 Hz) — the "right now" number
  currentFps(frames = 30) {
    const n = Math.min(frames, this.n);
    if (n === 0) return 0;
    let sum = 0;
    for (let k = 1; k <= n; k++) sum += this.intervals[(this.i - k + N) % N];
    return 1000 / (sum / n);
  }

  reset() {
    this.i = 0;
    this.n = 0;
  }

  summary(out: StatsSummary): StatsSummary {
    const n = this.n;
    if (n === 0) return out;
    let sumI = 0, sumS = 0, sumR = 0, over33 = 0, at45 = 0;
    for (let k = 0; k < n; k++) {
      const v = this.intervals[k];
      sumI += v;
      sumS += this.sims[k];
      sumR += this.renders[k];
      if (v > 33.4) over33++;
      if (v <= 22.3) at45++;
      this.scratch[k] = v;
    }
    const sorted = this.scratch.subarray(0, n).sort();
    out.fps = 1000 / (sumI / n);
    out.p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
    out.p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
    out.pctOver33 = (over33 / n) * 100;
    out.pctAt45 = (at45 / n) * 100;
    out.simMs = sumS / n;
    out.renderMs = sumR / n;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    out.heapMb = mem ? mem.usedJSHeapSize / 1048576 : -1;
    return out;
  }
}
