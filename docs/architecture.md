# Architecture

## Stack

TypeScript + Vite, a static single page, Canvas 2D for the game world and plain DOM for UI. There is no game engine and no runtime dependencies. The reasoning is in [decisions.md](decisions.md).

## Module layout

```
index.html            #hud (top bar) · #stage (canvases + stats panel + overlay) · #side (shop, panels)
src/
  main.ts             creates Game, Camera, Renderer, Stats, Loop, UI; input handling; stats panel; ?stress= boot
  loop.ts             Loop: one requestAnimationFrame callback, fixed-step accumulator, pause & speed
  game.ts             Game: entity arrays, waves, towers, combat, economy, stress controller
  render.ts           Renderer: draws one frame of Game through Camera
  ui.ts               UI: DOM HUD, shop, wave button, tower panel, enemy legend, stress sliders, overlays
  camera.ts           Camera: zoom (1 = fit map), pan, clamp, screen↔world, visible rect, base-hit shake
  map.ts              path waypoints → PATH polyline, CUM_LEN, TILE_KIND grid, pointAt(s)
  waves.ts            buildWave(n), hpMul, budget, spawnGap, waveBonus
  config.ts           world size, TOWERS / ENEMIES tables, upgrade formulas
  rng.ts              mulberry32 seeded PRNG
  bench/stats.ts      Stats: 600-frame ring buffer → StatsSummary
scripts/bench.mjs     headless benchmark (see performance/measurement.md)
```

Dependencies only point downward: `main → loop/game/render/ui → camera/map/waves/config/rng`. `game.ts` knows nothing about rendering or the DOM.

## Frame lifecycle

```
requestAnimationFrame(t)                                  loop.ts
 ├─ interval = t − last;  acc += min(interval, 250 ms) × speed   (skipped while paused)
 ├─ while acc ≥ 1/60 s and steps < 8:  game.update(1/60)  → sim ms
 │     (if 8 steps ran, acc = 0: drop time instead of spiralling)
 ├─ render():                                               main.ts
 │     panByKeys() → renderer.render(game, hover, selected) → ui.update() → stats panel (4 Hz)
 └─ stats.record(interval, simMs, renderMs)
```

- **Refresh-rate independence.** The simulation advances only in fixed 1/60 s steps, so a 144 Hz screen renders more often but simulates exactly as much per real second as a 60 Hz one.
- **Game speed.** At 2× or 4×, each frame runs 2–4 steps. Render cost doesn't change; sim cost scales.
- **One loop.** No entity owns a timer or animation loop. Cooldowns, slows, flashes and particle lifetimes are all fields decremented inside `update(dt)`.

## Game state

`Game.phase`: `menu → playing → victory | gameover`. Pause is `Loop.paused` (the sim stops but rendering continues, so the overlay and camera still work). Stress mode is `phase = 'playing'` with `Game.stress` set.

| Field | Meaning |
|---|---|
| `gold, lives, score, kills` | Economy and HUD |
| `wave` | Waves started so far (1–50) |
| `waveActive, spawnQueue, spawnIdx, waveTime` | Current wave's spawn schedule |
| `countdown` | Seconds until the next wave auto-starts (−1 = waiting for the player to start wave 1) |
| `time` | Simulation clock (seconds), used for slow expiry |
| `occupied[]` | Tower per tile (COLS×ROWS) for O(1) placement and click lookup |

## Data model (v0 naive)

Plain classes in plain arrays: `Enemy[]`, `Tower[]`, `Projectile[]`, `Particle[]`. Removal uses `splice` (and `indexOf` for kills). This is deliberate; see [performance/bottlenecks.md](performance/bottlenecks.md). The planned optimised model (typed-array SoA stores with free lists) is in [performance/optimizations.md](performance/optimizations.md).

**Enemies** store their position as `s`, the distance travelled along the path polyline. `pointAt(s)` turns that into `x, y`. Movement is then one addition per tick, and "first enemy" targeting is just "highest `s`".

## Stress mode

`Game.startStress({enemies, towers, projectiles})` resets the game and holds the counts constant:

- **Enemies** spawn spread along the path, cycling Runner/Swarm/Tank/Shielded at wave-25 HP. When an enemy reaches the base it wraps to `s = 0`. When it dies, its HP resets to max. Damage is still computed every hit, so the combat cost stays real.
- **Towers** go on random buildable tiles (a fixed shuffle, seed 7, so the layout repeats), cycling through the 4 types and levels 0–3.
- **Projectiles:** towers fire normally while the count is under target. After each tick, the count is topped up with bullets fired from random towers at random enemies.
- **Speed** is forced to 1× on start so benchmarks compare.
- **Sliders** call `setStress` to change counts live without a reset.

## Input

Pointer events go on the `#fg` canvas.
- A click (moved under 5 px) builds when a tower type is selected; otherwise it selects or deselects a tower.
- A drag pans; the wheel zooms around the cursor.
- A right click cancels.

Keyboard shortcuts are listed in [game-design.md](game-design.md#controls).
