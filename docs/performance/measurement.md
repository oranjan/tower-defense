# How performance is measured

## In-game stats panel (top-left)

`src/bench/stats.ts` keeps a **600-frame ring buffer** (about 10 s at 60 Hz) of three numbers per frame: the rAF interval, the sim time and the render time. It is preallocated, so measuring adds no garbage. The panel refreshes at 4 Hz.

| Panel line | Definition |
|---|---|
| `FPS` | 1000 / mean frame interval |
| `p95 frame` | 95th-percentile frame interval (ms) |
| `≥45 FPS` | % of frames with interval ≤ 22.3 ms (1000/45 = 22.2, plus timestamp jitter). **Requirement: ≥ 95 %** |
| `>33 ms` | % of frames with interval > 33.4 ms. **Requirement: < 5 %** |
| `sim` | Mean ms per frame spent in `Game.update` (all fixed steps that frame) |
| `render` | Mean ms per frame spent drawing the canvas, updating the UI and the panel |
| `heap` | `performance.memory.usedJSHeapSize` (Chrome only) |
| `E/T/P` | Live enemy / tower / projectile counts |

**Copy stats row (markdown)** in the Stress panel copies a ready-made [NUMBERS.md](../../NUMBERS.md) row. The same row is available in the console as `statsRow()`.

Sim and render are timed separately on purpose. They show whether a slowdown is CPU simulation (grid, pooling) or drawing (sprites, culling), and so which optimisation to reach for.

## Stress mode

Start it from the Stress panel (sliders or the S1/S2 presets) or with a URL: `?stress=5000,100,1000`. While it runs, the counts are held constant (details in [architecture.md](../architecture.md#stress-mode)):

- enemies wrap around at the base and are immortal (damage is still computed)
- the tower layout comes from a seeded shuffle
- projectiles are topped up every tick
- speed is forced to 1×

## Scenarios

| ID | E/T/P | Purpose |
|---|---|---|
| S1 | 2000 / 50 / 500 | Mid load. Shows the naive build straining |
| S2 | **5000 / 100 / 1000** | The brief's required scenario |
| S3 | Raise all three until `≥45 FPS` < 95 % | The ceiling (naive breaking point, then the final ceiling) |

## Protocol (numbers for NUMBERS.md and the video)

1. Desktop Chrome, window 1440×900, 60 Hz display. Note the Chrome version and machine.
2. Close other heavy tabs. Use the production build (deployed URL or `npm run build && npm run preview`), not the dev server.
3. Start the scenario, wait **5 s** for the window to fill with steady-state frames, then read or copy the panel.
4. For each optimisation, run the **same scenario** with the toggle off, then on (or naive URL vs final URL for build-level changes).
5. Paste both rows into [NUMBERS.md](../../NUMBERS.md).
6. **Memory:** run all 50 waves at 4× with a preset defence and watch `heap`. It should level off, not climb. Cross-check once with the DevTools Memory and Performance panels; that screenshot goes in the README.

## Headless benchmark (`npm run bench`)

```bash
npm run bench -- http://localhost:5173/ 2000,50,500 5000,100,1000
WARMUP_MS=8000 npm run bench -- https://td-naive.vercel.app/ 3500,85,850
```

`scripts/bench.mjs` launches your local Chrome headless (via `puppeteer-core`), starts each scenario, waits through the warm-up and prints `statsRow()` for each. Use it to spot regressions between commits. **Don't quote it as the final numbers:** headless Chrome has no vsync and a different GPU path, so absolute values differ from a real window.
