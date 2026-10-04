# Tower Defense

Browser tower defense: 50 waves, 4 towers, 5 enemy types. **60 FPS with 5,000 enemies / 100 towers / 1,000 projectiles** (100% of frames ≥45 FPS, 0% >33 ms); ceiling **12,000 / 200 / 3,000**.

- **Play:** https://td-final-eight.vercel.app · stress test: `?stress=5000,100,1000` (add `&naive=1` for all optimisations off, `&waves=1` for the 50-wave stress run)
- **Naive original:** https://td-naive.vercel.app
- **Numbers:** [NUMBERS.md](NUMBERS.md) · **Docs:** [docs/](docs/)

```bash
npm install && npm run dev     # http://localhost:5173 (naive at /naive/)
npm run build                  # static build in dist/
```

**Controls:** `1`–`4` pick a tower, click to build or select · `U` upgrade · `X` sell · `N` next wave · `Space` pause · `R` restart · `+`/`-` speed · wheel zoom · drag pan

## Architecture
TypeScript + Vite static site, no engine. One `requestAnimationFrame` loop runs the simulation in **fixed 1/60 s steps** and renders once per frame. The simulation (`game.ts`) is independent of rendering (`render.ts`) and the DOM UI (`ui.ts`). Each optimisation is a runtime flag (`flags.ts`), toggled live from the side panel. → [docs/architecture.md](docs/architecture.md)

## Rendering approach
Canvas 2D on two layers: a cached static map, plus a world layer where every entity is **one `drawImage` from a pre-rendered sprite atlas**. HP bars are drawn as batched paths, off-screen entities are culled, motion is interpolated between sim steps, and the DOM HUD is diffed at 10 Hz. → [docs/rendering.md](docs/rendering.md)

## Major performance bottlenecks
In the naive build every tower and bullet scans every enemy every tick (~5.5 M checks per tick), then spirals into catch-up frames. Each entity is drawn with its own `save/restore`, blur and text. It allocates and `splice`s constantly. It breaks at **3,000 / 75 / 750** and runs at **6 FPS** at 5,000. → [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md)

## Optimisations used
| Optimisation | Effect at 5,000 / 100 / 1,000 |
|---|---|
| Spatial grid (counting sort) | sim 54.8 → 1.2 ms |
| Object pools + swap-remove | 50-wave heap peak 7.4 → 5.0 MB |
| Target caching | sim −40% |
| Sprite atlas + batching | render 10.9 → 1.9 ms → 100% ≥45 FPS |
| Background layer + throttled HUD | no per-frame map redraw or DOM rebuild |
| Viewport culling | zoomed in: drawn 6,100 → 1,700, render −41% |

→ [docs/performance/optimizations.md](docs/performance/optimizations.md)

## How performance was measured
- **In-game panel:** a 600-frame ring buffer reporting FPS, **% of frames ≥45 FPS**, **% of frames >33 ms**, sim ms, render ms and heap.
- **Headless Chrome scripts** (`npm run report`, `stress-memory`, `refresh-rate`, `interactivity`) measured the full matrix:
  - each optimisation
  - the ceiling
  - a 50-wave run at stress load (heap 3–6 MB, flat)
  - input latency under load (≤32 ms)
  - identical game state from 30 to 240 Hz

→ [docs/performance/measurement.md](docs/performance/measurement.md)

## Design decisions
Details and rejected alternatives: [docs/decisions.md](docs/decisions.md).

1. TypeScript + Vite static site: fast iteration, deployable anywhere.
2. Canvas 2D, no engine: the optimisations stay ours and visible.
3. Naive version built and deployed first, then frozen as the baseline.
4. Fixed 1/60 s step with an accumulator (max 8 steps per frame): refresh-rate independent, no spiral.
5. One rAF loop for everything; timers are fields, not callbacks.
6. World in canvas, UI in DOM.
7. Seeded RNG: repeatable waves and benchmarks.
8. Enemy position = distance along the road: cheap movement and "first" targeting.
9. Stress mode holds counts constant so measurements are steady.
10. Metrics match the brief exactly (% ≥45 FPS, % >33 ms).
11. Towers and enemies counter each other (splash vs swarm, armor vs guns, slow resistance).
12. Waves come from formulas, not hand-written.
13. Auto-start countdown with an early-call bonus.
14. Numeric constants instead of TS enums.
15. Zoom 1×–4×; zooming in is what makes culling measurable.
16. devicePixelRatio capped at 2.
17. Prebuilt static deploys on separate Vercel projects.
18. Headless benchmark scripts as well as the live panel.
19. Struct-of-Arrays skipped: sim was already 0.46 ms.
20. Every optimisation is a live toggle, for before/after on one page.
21. Frozen v0 kept in `naive/`, served at `/naive/`.
22. Balance tuned with scripted bots (Gun-only loses on wave 47; a mixed build wins).
23. Kills are deferred to the end of the tick; IDs guard against recycled objects.
24. Supplied sounds not wired in (owner's call).
25. 50-wave stress run with mortal, replaced enemies, to prove memory under load.
26. Render interpolation for smooth motion on 120/144/240 Hz screens.
