# Tower Defense

A browser tower defense game: 50 waves, 4 towers, 5 enemy types. It is built to stay smooth with **5,000 enemies, 100 towers and 1,000 projectiles** on screen at once.

| Build | Link |
|---|---|
| Naive baseline (`v0-naive`) | https://td-naive.vercel.app |
| Final | _coming soon_ |

Stress test straight from the URL: `?stress=5000,100,1000` (enemies, towers, projectiles).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + static build in dist/
npm run bench -- http://localhost:5173/ 2000,50,500 5000,100,1000   # headless benchmark
```

There are no external services and no runtime dependencies: everything runs in the browser.

## The game

Build **Guns** (fast, single target), **Cannons** (splash), **Frost** towers (slowing pulses) and **Snipers** (long range, ignore armor) along a winding road. Upgrade each to level 4 or sell it for 70%. Hold off **Runners, Swarms, Tanks, Shielded** enemies and a **Boss** every 10 waves across 50 waves that keep getting harder.

You get gold, lives and score, a victory or game-over screen, pause, restart, 1×/2×/4× speed, and zoom/pan. Full stats and controls: [docs/game-design.md](docs/game-design.md).

**Controls:** click to build or select · `1`–`4` towers · `U` upgrade · `X` sell · `N` next wave · `Space` pause · `R` restart · `+`/`-` speed · wheel zoom · drag/WASD pan · `Esc` cancel

## Architecture

TypeScript + Vite static site. Canvas 2D for the world and DOM for the UI, with no game engine. A **single `requestAnimationFrame` loop** runs the simulation in **fixed 1/60 s steps** (so it behaves the same on 60/120/144 Hz screens) and renders once per frame. The simulation (`game.ts`) is independent of rendering (`render.ts`) and the UI (`ui.ts`).
→ [docs/architecture.md](docs/architecture.md)

## Rendering approach

The naive build draws every entity with its own `save/restore`, glow (`shadowBlur`), path and text, and redraws the full map each frame. The optimised build uses a cached background layer, pre-rendered sprites drawn in batches by type, two-pass HP bars, viewport culling and a throttled DOM HUD.
→ [docs/rendering.md](docs/rendering.md)

## Major performance bottlenecks

In the naive build, every tower and every bullet scans every enemy every tick (O(T·E + P·E): about 5.5 M distance checks per tick at the target load). It also allocates per shot and effect, removes with `splice`, and draws each entity with expensive per-entity canvas state. The simulation hits the wall first: about 3.5k enemies, then a spiral of death to 10 FPS at 5k.
→ [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md)

## Optimisations

1. Spatial grid · 2. Object pools · 3. SoA typed arrays · 4. Sprite batching · 5. Static background + throttled HUD · 6. Viewport culling · 7. Target caching. Each is measured on its own, most with a live toggle.
→ [docs/performance/optimizations.md](docs/performance/optimizations.md) · numbers in [NUMBERS.md](NUMBERS.md)

## How performance was measured

An in-game panel tracks a 600-frame ring buffer of frame intervals and reports FPS, p95, **% of frames at ≥45 FPS** and **% of frames over 33 ms** (the brief's two thresholds), plus sim ms, render ms and heap. Stress mode holds the enemy, tower and projectile counts constant. Final numbers come from desktop Chrome; `npm run bench` gives repeatable headless runs.
→ [docs/performance/measurement.md](docs/performance/measurement.md)

## Design decisions

Every decision, with its reasoning and the alternatives rejected: [docs/decisions.md](docs/decisions.md).

## Repo layout

```
README.md           this file
AGENTS.md           guide for AI coding agents: doc map, rules, commands
NUMBERS.md          before/after performance table
docs/
  PLAN.md           original build plan and timeline
  progress.md       step-by-step status
  architecture.md   modules, loop, state, stress mode
  game-design.md    towers, enemies, waves, economy, controls
  rendering.md      how frames are drawn
  decisions.md      design decision log
  deployment.md     Vercel setup and deploy steps
  video-script.md   demo video plan
  performance/
    measurement.md  metrics, protocol, bench script
    bottlenecks.md  naive build profile
    optimizations.md planned and finished optimisations
  assignment.png    the brief
src/                game source (see docs/architecture.md)
scripts/bench.mjs   headless benchmark
```
