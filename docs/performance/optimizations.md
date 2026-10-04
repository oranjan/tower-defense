# Optimisations

All six live in the final build behind **runtime toggles** (`src/flags.ts`). You can flip them in the **Optimisations** panel, or use `?naive=1` (all off) or `?off=grid,sprites,…`. The stats panel's first line shows which are on, e.g. `v1 [GPTSBC]`. With every flag off, the code takes the v0 paths: scan-everything, `new` + `splice`, per-entity canvas state, full redraws. The frozen v0 itself is also served at `/naive/`.

Measured results are in [NUMBERS.md](../../NUMBERS.md). Commit `bc7a7d7` adds the toggles.

| # | Optimisation | Flag | Fixes ([bottlenecks.md](bottlenecks.md)) | Effect at 5000/100/1000 | Status |
|---|---|---|---|---|---|
| 1 | Spatial grid for targeting, collision, splash and frost | `useGrid` (G) | Sim 1–3 | sim **54.8 → 1.2 ms**, FPS 14.9 → 54.2 | ✅ |
| 2 | Object pools + swap-remove + deferred enemy removal + particle cap | `usePool` (P) | Sim 5–6 | 50-wave heap peak **7.4 → 5.0 MB**; at the ceiling, turning it off drops ≥45 FPS from 100% to 86.8% | ✅ |
| 3 | Target caching: keep the target, only search when ready to fire | `useTargetCache` (T) | Sim 1 | sim **1.01 → 0.60 ms** (−40%); ≥45 FPS 91.7% → 96.2% | ✅ |
| 4 | Sprite atlas + batching: one `drawImage` per entity, batched HP bars, no save/restore, shadowBlur or text | `useSprites` (S) | Render 1–5 | render **10.9 → 1.9 ms**; ≥45 FPS 96.2% → **100%** | ✅ |
| 5 | Static background canvas + HUD diffed and throttled to 10 Hz | `useBgCache` (B) | Render 6, 8 | render 4.07 → 1.10 ms at 2000/50/500, with S | ✅ |
| 6 | Viewport culling against the camera rect | `useCulling` (C) | Render 7 | at 3× zoom: drawn 6,100 → ~1,700, render **2.26 → 1.33 ms** | ✅ |
| — | Struct-of-Arrays typed arrays | — | Sim 4, 7 | **Not done:** after 1–3, sim is 0.46 ms (3% of the frame), so there is nothing left to win ([decisions.md D19](../decisions.md)) | ✗ skipped |

## Why does the grid look like it does all the work?

1. **Diminishing returns.** The grid removes 98% of sim time (54.8 → 1.2 ms). Everything after it works on what's left, so the absolute gains look small even when the relative gain is large (target caching: −40% sim).
2. **Stress mode hides pooling.** Stress enemies are immortal, so nothing dies and little is allocated. Pooling matters in real play: see the 50-wave memory table in NUMBERS.md.
3. **Two walls, not one.** The grid fixes the sim wall. Sprite batching fixes the render wall, and it's what takes the required scenario from 89–96% to 100% of frames at ≥45 FPS.
4. **The ablation table** in [NUMBERS.md §3](../../NUMBERS.md#3-ablation-near-the-ceiling-each-optimisation-switched-off-on-its-own) switches each one off with everything else on, at 12000/200/3000. Removing the grid, pools, target caching or sprites each breaks the 95% requirement.

## How each one works

### 1. Spatial grid (`src/grid.ts`)
- **Layout:** 64 px cells over the world plus a 2-cell margin. `cellStart: Int32Array(cells + 1)` and `items: Enemy[]` (preallocated, 16,384 slots).
- **`rebuild()` every tick** is a counting sort: count per cell → prefix sum → scatter. O(E), no allocation.
- **`query(x, y, r, out)`** copies only the items in the cells overlapping the circle's bounding box. The row-major counting-sort order means one contiguous slice per row of cells. Callers do the exact distance test.
- **Users:** tower targeting, bullet collision (radius = biggest enemy + 3), cannon splash and frost pulses all go through it. A 140 px query touches about 9 cells instead of 5,000 enemies.
- **Object references, not indices:** the grid stores references, so killing an enemy mid-tick can't invalidate it. Callers skip `dead` enemies.

### 2. Pools (`Game.newEnemy / newProjectile / addParticle / remove*`)
- **Reuse:** `Enemy`, `Projectile` and `Particle` have `init()` methods and are reused from free lists. Every field is set in the constructor, so shapes stay monomorphic.
- **Removal:** swap-remove (`arr[i] = arr[last]; arr.pop()`) is O(1), instead of `splice`, which is O(n).
- **Kills mid-tick** only set `dead = true`. A single `sweepDead()` at the end of the tick removes them, so no `indexOf` + `splice` per kill.
- **Particle cap:** particles are capped at 2,500, and new ones are dropped when full.
- **Pool-off path:** `new` + `splice` exactly as v0.

### 3. Target caching (`Game.updateTower`)
A tower keeps its current target while it is alive (checked by `id`, so a recycled pooled object can't be mistaken for the old target) and in range. It only searches when the cooldown is ready and it has no valid target. 100–200 towers × 60 Hz of searches becomes a few per shot.

### 4. Sprites and batching (`src/sprites.ts`, `Renderer.fast*`)
- **Atlas:** one offscreen atlas canvas, drawn once at startup at 4× resolution. It holds each enemy type in three looks (normal, slowed, hit-flash), with glow, armor ring and letter baked in, plus the bullet, the shell and the 4 tower bases.
- **Entities:** each enemy, projectile or tower body is one `drawImage` from that single image, so Chrome can batch them.
- **HP bars:** two paths per frame (all backgrounds, then all fills), and skipped entirely below 0.5 scale.
- **Turrets:** rotated with a computed `setTransform` instead of `save/translate/rotate/restore`.
- **Dot particles:** `fillRect`, with `fillStyle` set only when the colour changes.

### 5. Background cache + HUD throttle
- **Map:** drawn onto `#bg` (an opaque context) only when `Camera.changedSince()` reports a pan, zoom, resize or shake. `#fg` is cleared to transparent each frame.
- **HUD and panels:** update at most every 100 ms, and write to the DOM only when a string actually changed (`UI.html()` / `UI.text()`). The naive path rewrites `innerHTML` every frame.

### 6. Viewport culling
`Camera.visible()` plus a 40 px margin (largest sprite + glow) gives a world rect. Every draw loop skips entities outside it, so render cost follows what's on screen. Demo: stress 5000/100/1000, zoom in with the mouse wheel, toggle **Viewport culling** and watch `drawn` and `render`.

## References (what each technique is based on)

| Technique here | Source |
|---|---|
| Sprite atlas / pre-rendering, batching draw calls, avoiding state changes and `shadowBlur`, layered canvases for a static background | MDN, *Optimizing canvas*: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas |
| Fixed 1/60 s step with an accumulator, capped catch-up to avoid the "spiral of death" | Glenn Fiedler, *Fix Your Timestep!*: https://gafferongames.com/post/fix_your_timestep/ |
| One loop driving everything; update vs render separation | Robert Nystrom, *Game Programming Patterns: Game Loop*: https://gameprogrammingpatterns.com/game-loop.html |
| Spatial grid for neighbour queries | *Game Programming Patterns: Spatial Partition*: https://gameprogrammingpatterns.com/spatial-partition.html |
| Object pools, free lists | *Game Programming Patterns: Object Pool*: https://gameprogrammingpatterns.com/object-pool.html |
| Measuring interactivity as input → next paint | web.dev, *Interaction to Next Paint (INP)*: https://web.dev/articles/inp |
| rAF callbacks run at the display's refresh rate, so animation must use elapsed time | MDN, *Window.requestAnimationFrame()*: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame |
