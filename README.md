# Tower Defense

A browser tower defense game: 50 waves, 4 towers, 5 enemy types. It holds **60 FPS with 5,000 enemies, 100 towers and 1,000 projectiles** on screen (100% of frames ≥ 45 FPS, 0% over 33 ms), and tops out at **12,000 / 200 / 3,000**.

| Build | Link |
|---|---|
| **Final** (optimised; toggle each optimisation live) | **https://td-final-eight.vercel.app** |
| Naive baseline (frozen v0) | https://td-naive.vercel.app · also https://td-final-eight.vercel.app/naive/ |
| Source | https://github.com/oranjan/tower-defense (tag `v0-naive` = original implementation) |

**Stress test straight from the URL:**
- `?stress=5000,100,1000` (enemies, towers, projectiles)
- add `&naive=1` to start with every optimisation off
- add `&off=grid,sprites` to switch specific ones off

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173  (naive copy at /naive/)
npm run build          # type-check + static build of both pages in dist/
npx vite preview --port 4317 &
npm run report -- http://localhost:4317/    # regenerates every table in NUMBERS.md (headless Chrome)
npm run memory -- http://localhost:4317/    # full 50-wave memory run
```

There are no external services and no runtime dependencies. The scripts use your local Chrome through `puppeteer-core`.

## The game

Build **Guns** (fast, single target), **Cannons** (splash), **Frost** towers (slowing pulses) and **Snipers** (long range, ignore armor) along a winding road. Upgrade each to level 4 or sell it for 70%. Hold off **Runners, Swarms, Tanks, Shielded** enemies and a **Boss** every 10 waves across 50 waves that keep getting harder.

You get gold, lives and score, a victory or game-over screen, pause, restart, 1×/2×/4× speed, and zoom/pan. Balance was tuned with a scripted bot: a Gun-heavy build falls on wave 47, while a Sniper/Cannon build with upgrades wins. Full stats and formulas: [docs/game-design.md](docs/game-design.md).

**Controls:** click to build or select · `1`–`4` towers · `U` upgrade · `X` sell · `N` next wave · `Space` pause · `R` restart · `+`/`-` speed · wheel zoom · drag/WASD pan · `Esc` cancel

## Architecture

TypeScript + Vite static site. Canvas 2D for the world and DOM for the UI, with no game engine. A **single `requestAnimationFrame` loop** runs the simulation in **fixed 1/60 s steps** (so it behaves the same on 60/120/144 Hz screens) and renders once per frame. The simulation (`game.ts`) is independent of rendering (`render.ts`) and the UI (`ui.ts`). Every optimisation is a runtime flag (`flags.ts`), so one build can show before and after live.
→ [docs/architecture.md](docs/architecture.md)

## Rendering approach

**Two stacked canvases:**
- a static map layer, redrawn only when the camera moves
- a world layer where every entity is **one `drawImage` from a pre-rendered sprite atlas**

Glow, armor rings and letters are baked into the atlas. HP bars are drawn as two batched paths. Off-screen entities are culled, and the DOM HUD is diffed and throttled to 10 Hz. The naive path (per-entity `save/restore`, `shadowBlur`, `arc`, `fillText`, full map redraw, `innerHTML` every frame) is kept behind the flags for comparison.
→ [docs/rendering.md](docs/rendering.md)

## Major performance bottlenecks

1. **Simulation:** every tower and every bullet scanned every enemy every tick. That's O(T·E + P·E), about 5.5 M distance checks per tick at the target load. Sim time grows quadratically, then spirals (6 FPS at 5,000 enemies).
2. **Rendering:** per-entity canvas state and blur cost about 12 ms per frame at 5,000 enemies.
3. **Allocation and removal:** `new` per shot and effect, and `splice` removals.

The naive build breaks at **3,000 / 75 / 750**.
→ [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md)

## Optimisations

| | Optimisation | Measured effect at 5000/100/1000 |
|---|---|---|
| G | Spatial grid (counting-sort, rebuilt every tick) | sim 54.8 → 1.2 ms |
| P | Object pools + swap-remove + deferred removal | 50-wave heap peak 7.4 → 5.0 MB |
| T | Target caching | sim −40% |
| S | Sprite atlas + batching | render 10.9 → 1.9 ms; 100% of frames ≥45 FPS |
| B | Static background layer + throttled HUD | removes the full map redraw and per-frame DOM rebuild |
| C | Viewport culling | at 3× zoom: drawn 6,100 → 1,700, render −41% |

With all six on, switching off any one of G, P, T or S at 12,000 enemies drops below the 95% bar (ablation in NUMBERS.md). A Struct-of-Arrays rewrite was planned and then **skipped on evidence**: sim is already 0.46 ms.
→ [docs/performance/optimizations.md](docs/performance/optimizations.md) · all numbers: [NUMBERS.md](NUMBERS.md)

## How performance was measured

**In-game panel:** a 600-frame ring buffer of frame intervals. It reports `FPS now`, `FPS avg`, p95, **% of frames ≥45 FPS** and **% of frames over 33 ms** (the brief's two thresholds), plus sim ms, render ms, heap and entities drawn. Stress mode holds the enemy, tower and projectile counts constant.

**Reproducible tables:** `npm run report` drives headless Chrome on the production build. Each row gets a 2 s warm-up, then a 5 s window. It produces the naive ramp, per-optimisation steps, culling at 3×, the ablation and the ceiling. `npm run memory` plays a full 50-wave game with a scripted player and samples the heap.
→ [docs/performance/measurement.md](docs/performance/measurement.md)

## Design decisions

All 24 decisions, with their reasoning and the alternatives rejected: [docs/decisions.md](docs/decisions.md).

## Repo layout

```
README.md            this file
AGENTS.md            guide for AI coding agents: doc map, rules, commands
NUMBERS.md           before/after performance tables
src/                 the game (see docs/architecture.md)
naive/               frozen v0 game, served at /naive/
scripts/             report.mjs · memory.mjs · bench.mjs
docs/
  PLAN.md            original build plan and timeline
  progress.md        step-by-step status
  architecture.md    modules, loop, state, data model, stress mode
  game-design.md     towers, enemies, waves, economy, controls, balance
  rendering.md       how frames are drawn
  decisions.md       design decision log
  deployment.md      Vercel setup and deploy steps
  video-script.md    demo video plan
  performance/
    measurement.md   metrics, protocol, scripts
    bottlenecks.md   naive build profile
    optimizations.md what each optimisation does and its effect
  assignment.png     the brief
sounds/              sound effects supplied for the game (not wired in)
```
