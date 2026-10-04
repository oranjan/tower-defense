# Bottlenecks in the naive build (v0)

Tag `v0-naive`, live at https://td-naive.vercel.app. All numbers come from headless Chrome on an Apple Silicon Mac (indicative; see [measurement.md](measurement.md)). The full table is in [NUMBERS.md](../../NUMBERS.md).

## The symptom

| E/T/P | FPS | ≥45 FPS % | >33 ms % | sim ms | render ms |
|---|---|---|---|---|---|
| 1000/30/300 | 60.0 | 100.0 | 0.0 | 1.12 | 1.83 |
| 2000/50/500 | 60.0 | 100.0 | 0.0 | 3.00 | 3.11 |
| 3000/75/750 | 60.0 | 100.0 | 0.0 | 6.93 | 4.58 |
| 3500/85/850 | 52.6 | 86.3 | 3.3 | 9.85 | 6.08 |
| 4000/90/900 | 36.2 | 34.4 | 22.8 | 17.37 | 6.62 |
| 5000/100/1000 | 10.0 | 5.7 | 92.5 | 89.64 | 8.21 |

Render time grows roughly **linearly** (1.8 → 8.2 ms). **Sim time grows quadratically**, then collapses past about 3.5k enemies. Once one frame takes longer than 16.7 ms, the next frame owes two or more fixed steps. That makes it slower again, until the 8-step cap is hit. This is the "spiral of death": the cap keeps the page responsive, but the game drops time.

**Conclusion:** the simulation is the first wall, and the renderer is the second.

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

Mapped to the planned work in [optimizations.md](optimizations.md):

| Bottleneck | Fix |
|---|---|
| Sim 1–3 | Spatial grid (opt 1), plus targeting only when the cooldown is ready and caching the target (opt 7) |
| Sim 5–6 | Object pools and swap-remove (opt 2) |
| Sim 4, 7 | SoA typed arrays and a cached segment index (opt 3) |
| Render 1–5 | Pre-rendered sprites batched by type (opt 4) |
| Render 6, 8 | Static background layer and a throttled HUD (opt 5) |
| Render 7 | Viewport culling (opt 6) |
