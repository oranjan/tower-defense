# Design decisions

The brief asks for **all** design decisions to be documented. One entry per decision: what, why, and what was rejected. Add new entries at the bottom and never rewrite history. If a decision changes, add a new entry that supersedes the old one.

---

### D1 — TypeScript + Vite, static site
**Why:** instant reload, a static `dist/` that any host serves, and types that catch index and unit bugs (important once entity data moves into typed arrays).
**Rejected:** plain JS (no type safety for SoA indices); React (a VDOM adds nothing to a canvas game and its re-renders would muddy perf numbers).

### D2 — Canvas 2D, no game engine
**Why:** the assignment grades *our* optimisations. An engine (Phaser, Pixi) hides batching and culling behind its own abstractions and adds per-sprite object overhead. Canvas 2D keeps every per-frame cost visible and ours to fix.
**Rejected:** Phaser, PixiJS, raw WebGL as the starting point. **Fallback:** if Canvas 2D can't hold 45 FPS at 5k sprites even with sprites and batching, swap only the renderer for PixiJS `ParticleContainer`. The simulation is kept renderer-agnostic so this stays a ≤30 min change.

### D3 — Build the naive version first, deploy it, keep it frozen
**Why:** the video must show the "initial implementation" breaking in a browser, then the deltas. A real, deployed naive build (tag `v0-naive`, https://td-naive.vercel.app) is honest evidence. Optimising from the start would leave nothing to compare against.
**Rejected:** a toggle-only approach without a separate baseline (some changes, like SoA, can't be toggled at runtime).

### D4 — Fixed 1/60 s simulation step with an accumulator
**Why:** the brief requires consistent behaviour across refresh rates. Fixed steps make the simulation deterministic and independent of display Hz. 2×/4× speed means more steps per frame. At most 8 steps run per frame, and leftover time is dropped so a slow frame can't snowball into slower frames (the "spiral of death").
**Rejected:** variable `dt` (behaviour varies with refresh rate; collisions get missed at large `dt`).

### D5 — One requestAnimationFrame loop for everything
**Why:** a hard requirement ("no timer/animation loop per entity"), and it gives one place to measure frame time. All timers are fields decremented in `update`.

### D6 — UI in DOM, world in canvas
**Why:** DOM text and buttons are sharper, accessible and easy to style. The canvas stays for things that scale with entity count.
**Trade-off:** DOM writes cost layout time, so the optimised build updates only on change, at ≤10 Hz (v0 deliberately rewrites the HUD every frame).

### D7 — Seeded RNG (mulberry32)
**Why:** the same seed gives the same waves and the same stress layout, so benchmarks repeat between runs and builds.

### D8 — Enemy position as distance along a polyline (`s`)
**Why:** movement is `s += v·dt`. "First" targeting is "max `s`". Leading a target is `pointAt(s + v·t)`. It also makes the end-of-path check and the stress wrap-around trivial.
**Rejected:** grid pathfinding (A*). The map has one fixed road, so it would be cost without benefit.

### D9 — Stress mode holds counts constant
**Why:** measurements need a steady state. Enemies wrap at the base and are immortal (HP resets, but damage is still computed), towers are placed by a seeded shuffle, and projectiles are topped up to the target every tick. Speed is forced to 1×.
**Rejected:** spawning a big wave and measuring while it dies off (the counts drift, so the numbers can't be compared).

### D10 — Frame-quality metrics match the brief's wording
**Why:** "≥45 FPS for 95% of frames" is measured as the % of frame *intervals* ≤ 22.2 ms (a 0.1 ms tolerance absorbs rAF timestamp jitter). "<5% of frames >33 ms" is the % of intervals > 33.4 ms. Both use a 600-frame window. Sim and render ms are measured separately so it's clear which side to fix. Definitions are in [performance/measurement.md](performance/measurement.md).

### D11 — Four towers and five enemy kinds that force different answers
**Why:** the brief asks for *meaningfully* different types. Each enemy defeats one tower and loses to another: Swarm overwhelms single-target towers (Cannon splash answers it), Shielded's flat armor makes Guns useless (Sniper or Cannon answer it), Tank and Boss soak damage and resist slow, and Runners outrun slow-firing towers (Gun and Frost answer them).

### D12 — Waves come from formulas, not a hand-written list
**Why:** 50 hand-written waves would take too long and be hard to balance. Formulas (`hpMul`, `budget`, unlock waves, weighted groups) give smooth difficulty growth and can be tuned through a few constants.

### D13 — Waves auto-start after a countdown, with an early-call bonus
**Why:** it keeps the pace up over 50 waves, and calling early is a risk/reward choice. Wave 1 waits for the player so there's time to build.

### D14 — Plain numeric constants instead of TypeScript `enum`
**Why:** `isolatedModules` (needed by Vite/esbuild) can't inline `const enum` across files, and normal enums add runtime objects. `export const GUN = 0` is zero-cost and works with typed arrays later.

### D15 — Camera zoom limited to 1× (fit) … 4×
**Why:** zoom 1 always shows the whole map, so the game is playable without touching the camera. Zooming in is what makes viewport culling measurable (at 1× everything is on screen, so there's nothing to cull).

### D16 — devicePixelRatio capped at 2
**Why:** a 3× DPR screen would multiply fill cost by 2.25 over 2× with no visible gain for this art style.

### D17 — Deploy prebuilt static files to separate Vercel projects
**Why:** the naive and final builds need their own permanent URLs for the video. Deploying the built `dist/` as static files avoids framework-detection issues. The Vercel CLI 50.17.1 scope bug is worked around with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (see [deployment.md](deployment.md)).

### D18 — Headless benchmark script alongside the in-game panel
**Why:** `npm run bench` gives repeatable numbers without touching the browser, which is handy for regression checks between commits. The **reported** numbers still come from desktop Chrome, because headless Chrome has no vsync and a different GPU path ([measurement.md](performance/measurement.md)).

### D19 — Struct-of-Arrays (typed arrays) skipped, on evidence
**Plan said:** move enemies and projectiles into `Float32Array` columns for cache locality.
**Measured:** after the grid, pools and target caching, simulation at 5000/100/1000 is **0.46 ms per frame**, about 3% of a 16.7 ms frame. Even at the ceiling (12000/200/3000) sim is 2.6 ms against 10.4 ms of render. A full data-model rewrite would carry real bug risk, and the most it could save is a fraction of a millisecond.
**Decision:** keep monomorphic pooled class instances (every field initialised in the constructor, reused through `init()`). If the ceiling ever needs to rise, the next lever is render (WebGL, see D2), not data layout.

### D20 — Optimisations as runtime toggles in one build
**Why:** the brief wants before/after *in action* for each optimisation. Toggles (`src/flags.ts`, the Optimisations panel, `?naive=1`, `?off=…`) let the video flip each one live on the same deployed page, on the same scenario. With all flags off, the code takes the v0 paths: same algorithms, `new` + `splice`, per-entity canvas state.
**Cost:** a branch per hot loop (negligible), and the naive paths stay in the codebase.

### D21 — Frozen naive copy in `naive/`, built as a second page
**Why:** the user wanted the old game kept in its own folder. `naive/` holds the v0 source (tag `v0-naive`) and is built by Vite as a second page, so every deploy of the final build also serves the untouched baseline at `/naive/`. The `td-naive` project serves the same folder on its own URL.
**Rule:** only measurement and display changes may touch `naive/`: the "FPS now" line, the `resetStats` hook, and the overlay fix for `?stress=` links. Never performance changes.

### D22 — Balance tuned with a scripted bot
**Why:** "sensible game balance" needs evidence, and there wasn't time for hours of play-testing. A headless bot builds on the best road-coverage tiles in a fixed rotation and upgrades with spare gold. It plays the whole game fast-forwarded in fixed steps.
**Findings:** the first curve let the bot win every wave without losing a life, and enemies never got past 60% of the road. That was because kill income scaled with enemy count. Changes:
- `hpMul` raised to `1 + 0.2n + 0.025n²` (wave 50 is ×74)
- `budget` raised to `15 + 7n + 0.3n²`
- kill rewards now shrink with `rewardMul(n) = 1 / (1 + 0.04n)`

**Result:** a Gun-heavy bot dies on wave 47. A Sniper/Cannon-heavy bot with more upgrades wins with all lives. Strategy decides the outcome.

### D23 — Kills during a tick are deferred (pooled mode)
**Why:** removing an enemy mid-tick shifts array indices under the loops still iterating. Pooled mode only sets `dead = true`, and `sweepDead()` swap-removes all of them once at the end of the tick. Every loop skips `dead`. Towers store the target's `id` as well as the reference, so a recycled object is never mistaken for the old target.

### D24 — Sound: files supplied, not wired in
The user added 21 sound files (`sounds/`). An audio manager was prototyped:
- Web Audio buffers
- sounds driven by per-tick event counters read once per frame
- a per-sound minimum gap so 50 guns don't make 50 voices
- muted during stress tests

The user then chose to leave sound out. The `Game.events` counters remain, so wiring it back in is a small change.

### D25 — 50-wave stress run
**Why:** the brief lists "memory usage must remain broadly stable during a complete 50-wave run" under *During the stress scenario*. The constant stress mode can't show that, because its enemies are immortal, so nothing is spawned or freed. The 50-wave stress run (`waves: true`; the **50-wave stress run** button or `?stress=5000,100,1000&waves=1`) works like this:
- the enemy, tower and projectile counts stay at the target
- waves 1 to 50 advance every `STRESS_WAVE_SECONDS` (6 s, so about 5 minutes in total)
- enemies are mortal and use each wave's real composition and HP
- every kill is replaced in the same tick

Spawning, killing and pooling then churn at full load for the whole run. `npm run stress-memory` records heap and frame stats across it.
**Rejected:** fast-forwarding (it measures heap but not frame quality), and a normal game at 5,000 enemies (the waves would never reach that load without a rebalance).

### D26 — Render interpolation for smooth motion
**Why:** the sim runs in fixed 60 Hz steps (D4), so on a 120/144/240 Hz display an entity only moves every 2nd–4th frame. Measured: at 144 Hz, 58% of frames show no movement, then a jump. Enemies and projectiles now keep their previous-step position (`px, py`). The renderer draws at `prev + (cur − prev) × alpha`, where `alpha = accumulator / STEP` comes from the loop. The result is 0% still frames and perfectly even per-frame movement at every rate (NUMBERS.md §7).
**Details:**
- Wrap-around in stress mode resets `px/py` so nothing streaks across the map.
- When the game isn't running (game over, victory), `alpha = 1`, so frozen entities don't jitter.
- The simulation is untouched, so determinism across refresh rates still holds.
**Rejected:** running the sim at the display rate (breaks D4 determinism); extrapolation (overshoots when enemies turn corners or die).
