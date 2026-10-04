# Bottlenecks in the naive build (v0)

Tag `v0-naive` / folder `naive/`, live at https://td-naive.vercel.app and https://td-final-eight.vercel.app/naive/. All numbers come from headless Chrome on an Apple Silicon Mac (see [measurement.md](measurement.md)).

## The symptom

From `npm run report` on the production build (2 s warm-up, then a 5 s window; full table in [NUMBERS.md](../../NUMBERS.md)):

| E/T/P | FPS | ≥45 FPS % | >33 ms % | sim ms | render ms |
|---|---|---|---|---|---|
| 1000/30/300 | 60.0 | 100.0 | 0.0 | 0.86 | 1.88 |
| 2000/50/500 | 60.0 | 100.0 | 0.0 | 2.62 | 3.05 |
| **3000/75/750** | 45.2 | **67.3** | 11.5 | 11.17 | 7.25 |
| 3500/85/850 | 37.5 | 39.9 | 19.7 | 15.47 | 7.27 |
| 4000/90/900 | 26.0 | 0.0 | 54.2 | 25.91 | 8.21 |
| 5000/100/1000 | 6.1 | 0.0 | 100.0 | 146.87 | 11.83 |

Render time grows roughly **linearly** (1.9 → 11.8 ms). **Sim time grows quadratically**, then collapses past about 3k enemies. Once one frame takes longer than 16.7 ms, the next frame owes two or more fixed steps. That makes it slower again, until the 8-step cap is hit. This is the "spiral of death": the cap keeps the page responsive, but the game drops time.

**Conclusion:** the simulation is the first wall, and the renderer is the second. That's why two optimisations do most of the work: the grid for sim, sprite batching for render.

## Simulation (per fixed step)

| # | Cost | Where | Complexity | At 5000/100/1000 |
|---|---|---|---|---|
| 1 | **Every tower scans every enemy for a target, every tick** (even while on cooldown) | `Game.updateTower` | O(T·E) | 500,000 distance checks/tick = 30 M/s |
| 2 | **Every bullet scans every enemy for a hit, every tick** | `Game.updateProjectiles` | O(P·E) | up to 5,000,000 checks/tick (stops at the first hit) |
| 3 | Frost pulses and Cannon splashes scan all enemies | `updateTower`, `explode` | O(E) per event | — |
| 4 | `pointAt` scans path segments from the start for every enemy every tick | `map.ts` | O(E·segments) | 5000 × ≤6 |
| 5 | `splice` / `indexOf` for every death, bullet hit and expired particle | everywhere | O(n) per removal | thousands of array shifts per second |
| 6 | `new Projectile` / `new Particle` per shot, hit and effect | everywhere | GC pressure | hundreds to thousands of objects per second, then GC pauses (spikes in `>33 ms`) |
| 7 | Objects scattered across the heap; each `e.x` read chases a pointer | `Enemy` class | cache misses | — |

## Rendering (per frame)

| # | Cost | Why it's slow |
|---|---|---|
| 1 | `shadowBlur` on every enemy, projectile and tower | A Gaussian blur pass per draw call, the most expensive Canvas 2D feature |
| 2 | `save()` / `restore()` per entity | Copies the full context state twice per entity |
| 3 | `beginPath/arc/fill` per entity | Rebuilds geometry per entity instead of blitting a cached sprite |
| 4 | `fillText` plus a `font` string per enemy | Text shaping per enemy, and parsing the font string on every set |
| 5 | A `fillStyle` change per entity, plus two for HP bars | State churn; no batching |
| 6 | The whole map redrawn every frame | 336 `fillRect`s plus the road stroke for pixels that never change |
| 7 | Everything drawn even when zoomed in | Cost doesn't scale with what's visible (a brief requirement) |
| 8 | HUD `innerHTML` rebuilt every frame | DOM parse, style and layout 60 times per second |

## What fixes what

Mapped to [optimizations.md](optimizations.md):

| Bottleneck | Fix |
|---|---|
| Sim 1–3 | Spatial grid (G), plus target caching (T) |
| Sim 5–6 | Object pools, swap-remove and deferred removal (P) |
| Sim 4, 7 | Not needed after the above; SoA skipped ([decisions.md D19](../decisions.md)) |
| Render 1–5 | Sprite atlas + batching (S) |
| Render 6, 8 | Background cache + HUD throttle (B) |
| Render 7 | Viewport culling (C) |
