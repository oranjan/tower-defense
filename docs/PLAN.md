# Tower Defense — Build Plan (Cactro assignment)

**Deadline: today, 04/10/2026, 17:00.** Plan written at 13:10 → ~3h50m left, of which ~45 min must be kept for the video + submission.
Brief: [`assignment.png`](assignment.png) (in `docs/`). Submit at https://forms.gle/ER387znmXfN4MvzdA

The grading story is not "did you make a game" — it is **"show the naive version break, show each fix with live before/after numbers, show the final ceiling."** Everything below is organised around producing that evidence.

---

## 1. What must be delivered (checklist)

### Game requirements → feature that satisfies it
| Requirement | How we satisfy it |
|---|---|
| Playable start→finish, no external services | Static site, all state in-browser |
| ≥ 50 waves, progressively harder | 50 waves generated from a formula (§4.4), boss every 10 |
| ≥ 3 meaningfully different towers | Gun (fast single-target), Cannon (slow splash), Frost (slow aura). Stretch: Sniper (armor-piercing, long range) |
| ≥ 4 meaningfully different enemies | Runner, Tank, Swarm, Shielded (+ Boss variant on waves 10/20/30/40/50) |
| Towers auto-target & attack | Targeting system, "first along path" default |
| Enemies follow path to base | Enemy position = scalar `s` (distance along path polyline) |
| Place / upgrade / sell, HP, money, score, victory, game-over | Shop + tower panel, HUD, overlay screens |
| Pause, restart, speed controls | Space / R / 1×-2×-4× buttons (speed = extra fixed steps per frame) |

### Performance requirements → mechanism
| Requirement | Mechanism |
|---|---|
| 5,000 enemies / 100 towers / 1,000 projectiles at ≥45 FPS (95% frames), <5% frames >33 ms | Spatial grid + SoA typed arrays + pooling + batched sprite rendering |
| Interactive during stress | Input handled in the same loop; HUD DOM updated at ≤10 Hz |
| Memory stable over a full 50-wave run | Zero allocation in the hot loop (pools, pre-sized typed arrays, no splice/closures) |
| Render cost doesn't scale with off-screen objects | Camera + AABB culling against the viewport |
| Consistent across refresh rates | Fixed-timestep simulation (1/60 s) with accumulator; render at whatever rAF rate |
| No timer/animation loop per entity | One `requestAnimationFrame` loop drives everything |

### Submission artefacts
- [ ] Deployed URL (Vercel) — **final build**
- [ ] Deployed URL — **naive build** (git tag `v0-naive`, separate Vercel project) so the video can show before/after live
- [ ] `README.md`: architecture, rendering approach, bottlenecks, optimizations, how performance was measured
- [ ] `NUMBERS.md`: before/after table for every optimization (numbers derived live in the video)
- [ ] Video 2–5 min (ideal 3–4), face on camera, English; first 30 s = first optimization before/after **in action**

---

## 2. Tech stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Language / build | **TypeScript + Vite** | Instant dev reload, static build for Vercel, types catch index bugs in typed-array code |
| Rendering | **Canvas 2D**, two stacked canvases (static bg + dynamic fg) | Enough for 5k sprites if batched; keeps every per-frame cost visible and ours to optimise |
| UI (HUD, shop, overlays) | **Plain HTML/CSS** over the canvas | Easier to style than canvas text; updated only on change / throttled |
| Game engine | **None** | The assignment grades *our* optimisations; an engine hides them and adds per-sprite overhead |
| Data | **SoA typed arrays + free-list pools** | Cache-friendly iteration, zero GC churn |
| Spatial index | **Uniform grid, rebuilt per tick with counting sort** | O(1) neighbourhood queries, no allocation |
| Measurement | In-game stats panel + Chrome DevTools Performance/Memory | Numbers must be derivable live on screen in the video |
| Hosting | **Vercel** (`npx vercel --prod`) | One command, static |
| RNG | Seeded `mulberry32` | Reproducible waves → reproducible benchmarks |

**Fallback:** if Canvas 2D cannot hold 45 FPS at 5k enemies even after batching, swap *only* `render/` for PixiJS `ParticleContainer`. Keep `render/` isolated from simulation so this is a ≤30 min change.

---

## 3. Architecture

```
tower-defense/
  PLAN.md  README.md  NUMBERS.md  assignment.png
  index.html  package.json  tsconfig.json  vite.config.ts
  src/
    main.ts              bootstrap: canvases, input, loop, UI wiring
    config.ts            constants, balance tables, FEATURE FLAGS (optimisation toggles)
    flags.ts             runtime toggles object + URL param parsing (?naive=1)
    rng.ts               mulberry32
    loop.ts              fixed-timestep accumulator, speed multiplier, pause
    map.ts               tile grid, path waypoints → polyline with cumulative lengths, placement validity
    camera.ts            pan/zoom, world↔screen, visible AABB
    state.ts             GameState enum + run state (gold, lives, score, wave, selection)
    entities/
      enemies.ts         SoA store + pool + spawn/kill + advance along path
      towers.ts          AoS is fine (≤100s) + upgrade/sell maths
      projectiles.ts     SoA store + pool (bullet / shell)
      particles.ts       pooled, hard-capped effects
    systems/
      waves.ts           50-wave generator, spawn scheduler, early-call bonus
      spatialGrid.ts     uniform grid, rebuild(), queryCircle(cb)
      targeting.ts       per-tower target selection (grid or brute force by flag)
      combat.ts          projectile motion, hit tests, splash, slow aura, damage/armor
      economy.ts         kill rewards, wave bonus, score
    render/
      sprites.ts         pre-rendered offscreen canvases per enemy/projectile/tower type (+ hit-flash variant)
      background.ts      draws map once into bg canvas (redraw only on resize/zoom)
      renderer.ts        per-frame fg draw: cull → batch by type → drawImage; hp bars in 2 fillRect passes
      effects.ts         range circles, wave banner, muzzle flashes, death puffs
    ui/
      hud.ts             gold/lives/wave/score (dirty-flag updates, ≤10 Hz)
      shop.ts            tower buttons, costs, hotkeys 1-4
      towerPanel.ts      selected tower: stats, upgrade, sell
      overlays.ts        menu / pause / victory / game-over
    bench/
      stats.ts           frame-time ring buffer → FPS, p95, p99, % >33 ms, heap (performance.memory)
      stress.ts          spawn N enemies / M towers / K projectiles, hold counts constant
      panel.ts           stress sliders, flag toggles, "copy row as markdown" button
```

### 3.1 The loop (`loop.ts`)
```
STEP = 1/60 s, MAX_STEPS_PER_FRAME = 6
rAF(t):
  frameDt = min(t - last, 0.25); last = t
  if !paused: acc += frameDt * speed       // speed ∈ {1,2,4}
  steps = 0
  while acc >= STEP && steps < MAX_STEPS: simulate(STEP); acc -= STEP; steps++
  if steps == MAX_STEPS: acc = 0           // drop time instead of spiralling
  render()                                  // once per rAF regardless of steps
  stats.record(performance.now() - t0)
```
- 144 Hz screen → more renders, same number of sim steps per real second. ✔ refresh-rate independence.
- 4× speed = up to 4 sim steps per frame; sim cost scales, render cost doesn't.

### 3.2 Enemy store (SoA)
```
cap = 8192 (stress needs 5k + spawn headroom)
x, y, s, hp, maxHp, speed, slowUntil, slowMul : Float32Array
type, flags(alive|flash|...)                   : Uint8Array
segIdx                                         : Int32Array   // cached path segment for s→(x,y)
free: Int32Array stack; alive list: Int32Array + count (swap-remove on death)
```
- Advance: `s += speed * slowMul * dt`; walk `segIdx` forward while `s > cumLen[segIdx+1]`; x,y = lerp on segment.
- Reached end: damage base, release to pool. In stress mode: wrap to `s = 0` instead (keeps counts constant).

### 3.3 Projectiles (SoA)
```
cap = 4096
x, y, vx, vy, dmg, ttl, splash : Float32Array ; type : Uint8Array ; owner : Int16Array
```
- Gun bullet: straight line, each tick `grid.queryCircle(x,y,r)` → first alive hit → damage, release.
- Cannon shell: travels to a fixed target point, on arrival `queryCircle(point, splashR)` → damage all.
- Frost: no projectile; every tick (or every 3rd tick) `queryCircle(tower, range)` → set `slowUntil`.
  All three go through the grid → one optimisation, three visible beneficiaries.

### 3.4 Spatial grid (`spatialGrid.ts`)
- Cell = 64 px. `cellStart: Int32Array(cells+1)`, `items: Int32Array(cap)`.
- `rebuild()` each tick: count per cell → prefix sum → scatter (counting sort). Zero allocation.
- `queryCircle(cx, cy, r, cb)` iterates only overlapping cells.
- Towers only query **when their cooldown is ready** (not every tick) and **cache the target** until it dies / leaves range.

### 3.5 Rendering (`renderer.ts`)
1. bg canvas: tiles, path, decorations — drawn once (`background.ts`), redrawn only on resize/zoom.
2. fg per frame: `clearRect` → compute camera AABB → for each enemy type: loop alive, skip if outside AABB, `drawImage(sprite[type], x-hw, y-hh)` → projectiles same → towers (≤100, cheap) → hp bars: pass 1 red rects, pass 2 green rects (2 fillStyle changes total) → effects → selection/range circle.
3. No `save/restore`, no `shadowBlur`, no per-entity `beginPath/arc`, no text in the hot path.
4. HP bars only for damaged enemies; when zoomed out below 0.6 skip them entirely (unreadable anyway).

### 3.6 Camera
World 24×14 tiles × 64 px = 1536×896. Default: fit to window. Wheel = zoom (0.5–3×), drag/WASD = pan. Culling only pays off when zoomed in — that is how we demonstrate it in the video.

---

## 4. Game design

### 4.1 Map
Single hand-authored S-shaped path (waypoint list in tiles), spawn top-left, base bottom-right. ~55 path tiles ≈ 3,500 px. Non-path tiles are buildable; path, spawn, base are not.

### 4.2 Towers (base stats, 3 upgrade levels)
| Tower | Cost | Dmg | Rate | Range | Special | Role |
|---|---|---|---|---|---|---|
| Gun | 50 | 8 | 5/s | 140 | — | cheap DPS, Runners/Swarm |
| Cannon | 120 | 40 | 0.8/s | 170 | splash r=60 | groups, Tanks |
| Frost | 80 | 2 | aura | 120 | slow 45% for 1.5 s | force-multiplier |
| Sniper (stretch) | 200 | 120 | 0.4/s | 320 | ignores armor | Shielded/Boss |

Upgrade: level k costs `round(base * 0.75 * k)`; +35% dmg, +10% range, +15% rate per level. Sell = 70% of total invested. Targeting mode: first (default) / strongest / closest (stretch).

### 4.3 Enemies
| Enemy | HP | Speed px/s | Armor | Lives cost | Reward | Note |
|---|---|---|---|---|---|---|
| Runner | 30 | 110 | 0 | 1 | 4 | fast, fragile |
| Swarm | 10 | 90 | 0 | 1 | 1 | spawn in bursts of 8–20 |
| Tank | 220 | 45 | 0 | 3 | 12 | frost-resistant (slow halved) |
| Shielded | 90 | 70 | 6 flat/hit | 2 | 10 | gun nearly useless → forces Cannon/Sniper |
| Boss (w10/20/30/40/50) | 1500 × wave/10 | 35 | 8 | 10 | 150 | one per boss wave |

Damage formula: `max(1, dmg - armor)` (Sniper ignores armor).

### 4.4 Waves (50, generated)
```
hpMul(n)    = 1 + 0.10n + 0.004n²      // w1 1.1×, w25 6×, w50 16×
budget(n)   = 20 + 8n + 0.5n²          // spent on enemy "points"
unlock: Runner w1, Swarm w3, Tank w6, Shielded w9, Boss w10/20/30/40/50
spawnGap(n) = max(0.12, 0.6 - 0.01n) s ; waveBonus(n) = 25 + 5n
```
Composition: deterministic mix per wave from seeded RNG, weighted toward newly unlocked type. Next wave starts 8 s after last spawn or on "Call early" (+bonus proportional to time saved). Wave 50 cleared → VICTORY. Lives 0 → GAME OVER. Score = kill rewards×10 + wave bonuses + remaining gold at end.

### 4.5 Economy / start
Gold 220, lives 20. Tuned so a mid build survives to ~w30 with casual play; needs Frost+Cannon synergy to pass bosses.

### 4.6 Controls
Click tile with tower selected → place (red ghost if invalid/unaffordable). Click tower → panel (upgrade U / sell X). Hotkeys 1–4 towers, Space pause, R restart, +/- or buttons speed, Esc cancel, wheel zoom, drag pan. Hover shows range ring.

### 4.7 States
`MENU → PLAYING ⇄ PAUSED → VICTORY | GAMEOVER`; `STRESS` is PLAYING with the stress controller active (waves off, counts held constant).

---

## 5. Build order (do it in this order — the naive version is a deliverable, not a draft)

### Step 1 — Skeleton + stats panel (13:15–13:35)
- `npm create vite@latest . -- --template vanilla-ts`, git init
- Canvases, resize, fixed loop, `bench/stats.ts` + on-screen panel (FPS, p95 ms, % >33 ms, counts, heap)
- **Why first:** every later step gets measured the moment it exists.

### Step 2 — Naive playable game (13:35–14:50)  → tag `v0-naive`, deploy as *naive* URL
Written the "obvious" way on purpose — this is the "initial LLM implementation" the video must break:
- `class Enemy {}` objects in a plain array, `splice` on death
- every tower loops over **all** enemies every tick to pick a target
- every projectile loops over **all** enemies for collision
- `new Projectile()` per shot, `new Particle()` per effect
- each enemy drawn with `save → beginPath → arc → fill → shadowBlur → fillText → restore`
- map redrawn every frame on one canvas; HUD `innerHTML` every frame
- but **still** fixed-timestep + single rAF (those are correctness requirements, not optimisations)
- Must include: map, path, 4 enemies, 3 towers, 50 waves, place/upgrade/sell, gold/lives/score, pause/speed/restart, victory/game-over. Ugly is fine; feature-complete is required.

### Step 3 — Stress mode + record "before" numbers (14:50–15:10)
- Sliders: enemies (0–10k), towers (0–200), projectiles (0–3k); "hold constant" wrap-around
- Find the naive breaking point: raise enemies until FPS < 45 → write the triple (E/T/P) into NUMBERS.md
- Commit, `git tag v0-naive`, deploy to Vercel project `td-naive`

### Step 4 — Optimisations, one at a time, each measured (15:10–16:05)
Each has a runtime toggle in the panel where feasible so the video can flip it live.

| # | Optimisation | Toggle? | Expected effect | Measure |
|---|---|---|---|---|
| 1 | **Spatial grid** for targeting + collision (replaces O(T·E + P·E)) | yes `useGrid` | biggest win: sim time collapses | FPS/p95 at 2k E / 50 T / 500 P |
| 2 | **Object pools** (enemies, projectiles, particles) — no `new`, no `splice` | yes `usePool` | GC pauses vanish → % >33 ms drops, heap flat | heap graph + % >33 ms |
| 3 | **SoA typed arrays** for enemies/projectiles | build-level (v0 vs v1) | faster iteration, lower memory | FPS at 5k E |
| 4 | **Batched sprite rendering** (pre-rendered sprites, grouped by type, no save/restore/shadow/text) | yes `useSprites` | render time ÷ 5–10 | render ms at 5k E |
| 5 | **Static bg layer + throttled HUD** | yes `useBgCache` | removes constant per-frame cost | render ms |
| 6 | **Viewport culling** | yes `useCulling` | render ∝ visible only | zoom in at 5k E, toggle |
| 7 | Tower query only on cooldown + target caching | yes `useTargetCache` | fewer grid queries at 100 T | sim ms |

After each: run the fixed scenario, hit "copy row", paste into NUMBERS.md. Commit after each (`opt1-grid`, `opt2-pool`, …).

### Step 5 — Polish (16:05–16:25)
Hit flash (sprite variant), death puff (pooled, capped 400, off in stress), floating gold text (capped), wave banner, base-hit shake, muzzle flash, range rings, hover ghost, nicer colours/tiles, tooltips with stats. Balance pass: play w1–15 at 4×, adjust.

### Step 6 — README + NUMBERS + deploy final (16:25–16:45)
Deploy `td-final`, open both URLs, sanity-play, check stress scenario 5k/100/1k hits ≥45 FPS.

### Step 7 — Video + submit (16:45–17:00) *(hard stop; if behind, cut Step 5 first)*

### Cut list (in order, if time runs out)
Sniper tower → targeting modes → camera zoom (keep culling testable via a "zoom" button instead) → particles → sound (not planned anyway) → early-call bonus.

---

## 6. Measurement protocol (goes in README)
- Hardware: this Mac, Chrome (note version), window 1440×900, 60 Hz (also check a 120 Hz run if available).
- Scenario S1 = 2,000 E / 50 T / 500 P (naive breaks here); S2 = **5,000 E / 100 T / 1,000 P** (required); S3 = push until FPS < 45 (final ceiling).
- Procedure: enable stress, wait 3 s warm-up, read the 10-second window: avg FPS, p95 frame ms, % frames >33 ms, sim ms, render ms, heap MB.
- Memory: 50-wave run at 4× with a preset defense (stress panel "auto-build"), heap sampled every 5 s → should plateau, not climb.
- Cross-check with Chrome Performance tab once for the README screenshot.

## 7. NUMBERS.md template
```
| # | Optimisation | Scenario (E/T/P) | Before FPS | Before p95 ms | Before % >33 ms | After FPS | After p95 ms | After % >33 ms |
|---|---|---|---|---|---|---|---|---|
| 0 | Naive breaking point | ?/?/? | — | — | — | — | — | — |
| 1 | Spatial grid | 2000/50/500 | | | | | | |
| 2 | Pooling | 2000/50/500 | | | | | | |
| 3 | SoA typed arrays | 5000/100/1000 | | | | | | |
| 4 | Batched sprites | 5000/100/1000 | | | | | | |
| 5 | Bg cache + HUD throttle | 5000/100/1000 | | | | | | |
| 6 | Culling (zoomed in) | 5000/100/1000 | | | | | | |
| F | Final ceiling (FPS < 45) | ?/?/? | | | | | | |
```

## 8. Video script (target 3:30, face cam on, English)
| Time | Show |
|---|---|
| 0:00–0:30 | **Before/after in action:** naive URL at S1 stuttering → final URL same S1 smooth (or toggle `useGrid` off/on live). Read the FPS numbers aloud. |
| 0:30–1:15 | Naive breaking point: slide enemies up on naive URL until FPS < 45, point at the triple on screen. |
| 1:15–2:45 | Each optimisation: flip toggle, read before/after. Grid (why O(n·m) dies), pooling (show heap flat vs sawtooth), sprites/batching (render ms), culling (zoom in, toggle). One sentence each on *why*. |
| 2:45–3:15 | Final: set 5,000/100/1,000 → show ≥45 FPS, p95, % >33 ms. Then push further to the new ceiling. |
| 3:15–3:30 | 15 s of actual gameplay (place, upgrade, sell, speed, wave banner) to prove it's a game. Wrap. |

## 9. Risks & fallbacks
| Risk | Mitigation |
|---|---|
| Canvas 2D can't hit 45 FPS at 5k | Isolated `render/` → PixiJS ParticleContainer swap (≤30 min). Check at Step 4.4, not later. |
| Naive version takes too long | Features over looks. Reuse the same `config.ts` tables in both versions. |
| Stress counts drift (enemies die / bullets expire) | "Hold constant" mode: wrap enemies, respawn projectiles, enemies immortal. |
| Culling has nothing to cull | Camera zoom exists; stress demo zooms in before toggling. |
| Toggling SoA at runtime is impractical | Measured as build-vs-build (naive deploy vs final deploy). Say so in README. |
| Vercel deploy hiccup | `npx vercel --prod` from the folder; fallback Netlify drop of `dist/`. |
| Time | Hard checkpoints above; cut list in §5. Video before polish if at 16:30 things aren't deployed. |

## 10. First commands for the next session
```bash
cd ~/Desktop/tower-defense
npm create vite@latest . -- --template vanilla-ts   # answer "ignore files and continue" if prompted
npm i && git init && git add -A && git commit -m "chore: vite scaffold"
npm run dev
```
Then follow §5 Step 1.
