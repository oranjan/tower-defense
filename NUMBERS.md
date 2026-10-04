# Performance numbers

**Before:** the naive build breaks at **3,000 enemies / 75 towers / 750 projectiles** and runs at **6 FPS** at the required 5,000 / 100 / 1,000.
**After:** the final build holds **60 FPS with 100% of frames at ≥45 FPS and 0% over 33 ms** at 5,000 / 100 / 1,000. Its ceiling is **12,000 / 200 / 3,000** (2.4× the required enemies, 2× towers, 3× projectiles).

| | Naive (v0) | Final (v1) |
|---|---|---|
| Breaking point (first scenario under 95% of frames at ≥45 FPS) | **3,000 / 75 / 750** | **14,000 / 200 / 3,000** |
| Highest scenario that passes | 2,000 / 50 / 500 | **12,000 / 200 / 3,000** |
| Required 5,000 / 100 / 1,000 | 6.1 FPS · 0% ≥45 FPS · 100% >33 ms | **60 FPS · 100% ≥45 FPS · 0% >33 ms** |
| Sim time at 5,000 / 100 / 1,000 | 146.9 ms | **0.46 ms** (~320× less) |
| Render time at 5,000 / 100 / 1,000 | 11.8 ms | **1.9 ms** (~6× less) |
| Heap over a full 50-wave run (normal play) | — | **1.9–5.0 MB, flat** |
| Heap over a full 50-wave run **at 5,000 / 100 / 1,000** | — | **3.0–6.1 MB, flat**; 100% of frames ≥45 FPS for the whole 5 min |
| Input → next paint under stress (worst) | 224 ms | **32 ms** |
| Same game state at 30–240 Hz displays | — | **identical**; motion interpolated, so it's even on 120/144/240 Hz |

Live: final https://td-final-eight.vercel.app · naive https://td-naive.vercel.app (also https://td-final-eight.vercel.app/naive/)

## How to read and reproduce

- **E/T/P:** enemies / towers / projectiles, held constant by stress mode (enemies wrap round and are immortal, projectiles are topped up every tick). The speed is 1×.
- **`≥45 FPS %`:** share of frames with an interval ≤ 22.2 ms. The requirement is **≥ 95%**.
- **`>33 ms %`:** share of frames slower than 33 ms. The requirement is **< 5%**.
- **`sim` / `render`:** mean JavaScript ms per frame in the simulation and in drawing plus UI.
- **Flags** in brackets: `G` grid · `P` pools · `T` target caching · `S` sprite batching · `B` background cache + HUD throttle · `C` culling. A `·` means that optimisation is off.
- **Environment:** headless Chrome 154 on an Apple Silicon Mac, 1440×900, production build (`vite preview`). Each row is a 2 s warm-up, then a stats reset, then a 5 s window. Absolute numbers in desktop Chrome differ; the video derives them live on the deployed URLs.
- **Reproduce:**
  - `npm run build && npx vite preview --port 4317`
  - `npm run report -- http://localhost:4317/` (every table below)
  - `npm run memory -- http://localhost:4317/ [nopool]`
  - `npm run stress-memory -- http://localhost:4317/` · `npm run refresh-rate -- …` · `npm run interactivity -- …`

Method details: [docs/performance/measurement.md](docs/performance/measurement.md). Why v0 is slow: [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md). What each optimisation does: [docs/performance/optimizations.md](docs/performance/optimizations.md).

## 1. Naive build (v0): finding the breaking point

| Build | E/T/P | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms | heap MB |
|---|---|---|---|---|---|---|---|---|
| v0 naive | 1000/30/300 | 60.0 | 16.7 | 100.0 | 0.0 | 0.86 | 1.88 | 2 |
| v0 naive | 2000/50/500 | 60.0 | 16.7 | 100.0 | 0.0 | 2.62 | 3.05 | 2 |
| v0 naive | **3000/75/750** | **45.2** | 33.4 | **67.3** | **11.5** | 11.17 | 7.25 | 3 |
| v0 naive | 3500/85/850 | 37.5 | 33.4 | 39.9 | 19.7 | 15.47 | 7.27 | 2 |
| v0 naive | 4000/90/900 | 26.0 | 50.1 | 0.0 | 54.2 | 25.91 | 8.21 | 3 |
| v0 naive | 5000/100/1000 | 6.1 | 200.0 | 0.0 | 100.0 | 146.87 | 11.83 | 4 |

Sim time grows quadratically (every tower and bullet checks every enemy), then spirals: a slow frame owes more fixed steps the next frame.

## 2. Each optimisation, before → after (switched on one at a time)

The "before" for each row is the row above it. Same build, toggled live from the Optimisations panel.

### Required scenario: 5000/100/1000

| # | Added | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms | heap MB |
|---|---|---|---|---|---|---|---|---|
| 0 | nothing (naive paths) `[······]` | 14.9 | 83.3 | 0.0 | 100.0 | 54.81 | 8.17 | 8 |
| 1 | **Spatial grid** `[G·····]` | 54.2 | 33.3 | 89.3 | 4.1 | **1.17** | 11.33 | 9 |
| 2 | Object pools `[GP····]` | 55.2 | 33.3 | 91.7 | 4.3 | 1.01 | 11.12 | 8 |
| 3 | Target caching `[GPT···]` | 57.8 | 16.8 | 96.2 | 2.1 | **0.60** | 10.90 | 8 |
| 4 | **Sprite batching** `[GPTS··]` | **60.0** | 16.8 | **100.0** | **0.0** | 0.46 | **1.91** | 10 |
| 5 | Bg cache + HUD throttle `[GPTSB·]` | 60.0 | 16.7 | 100.0 | 0.0 | 0.45 | 1.85 | 11 |
| 6 | Viewport culling `[GPTSBC]` | 60.0 | 16.7 | 100.0 | 0.0 | 0.46 | 1.87 | 12 |

### Mid scenario: 2000/50/500

| # | Added | FPS | ≥45 FPS % | sim ms | render ms |
|---|---|---|---|---|---|
| 0 | nothing `[······]` | 60.0 | 100.0 | 3.68 | 4.07 |
| 1 | Spatial grid | 60.0 | 100.0 | **0.20** | 3.11 |
| 2 | Object pools | 60.0 | 100.0 | 0.19 | 3.12 |
| 3 | Target caching | 60.0 | 100.0 | 0.14 | 3.11 |
| 4 | Sprite batching | 60.0 | 100.0 | 0.17 | **1.18** |
| 5 | Bg cache + HUD throttle | 60.0 | 100.0 | 0.17 | 1.10 |
| 6 | Viewport culling | 60.0 | 100.0 | 0.18 | 1.23 |

### Viewport culling where it applies: zoomed in to 3×, 5000/100/1000

At 1× zoom the whole map is on screen, so there is nothing to cull. Zoomed in, about 72% of entities are off screen.

| Culling | FPS | ≥45 FPS % | entities drawn | render ms |
|---|---|---|---|---|
| off `[GPTSB·]` | 60.0 | 100.0 | 6,100 | 2.26 |
| on `[GPTSBC]` | 60.0 | 100.0 | ~1,700 | **1.33** (−41%) |

## 3. Ablation near the ceiling: each optimisation switched off on its own

All on, then exactly one off, at 12000/200/3000. This shows what each optimisation is still worth once the others are in place. The cumulative table above under-credits the later ones, because the grid already removed most of the sim cost.

| Switched off | Flags | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms | Meets brief? |
|---|---|---|---|---|---|---|---|---|
| none | `[GPTSBC]` | 60.0 | 16.7 | 100.0 | 0.0 | 2.67 | 10.75 | ✅ |
| Spatial grid | `[·PTSBC]` | 1.2 | 866.6 | 0.0 | 100.0 | 801.66 | 11.71 | ❌ |
| Object pools | `[G·TSBC]` | 53.0 | 33.4 | 86.8 | 5.3 | 4.14 | 12.15 | ❌ |
| Target caching | `[GP·SBC]` | 56.8 | 33.3 | 94.4 | 2.8 | 4.20 | 11.06 | ❌ |
| Sprite batching | `[GPT·BC]` | 24.6 | 50.1 | 0.0 | 65.9 | 6.87 | 33.02 | ❌ |
| Bg cache + HUD throttle | `[GPTS·C]` | 58.6 | 16.8 | 98.0 | 1.0 | 2.94 | 11.40 | ✅ |
| Viewport culling | `[GPTSB·]` | 52.6 | 33.4 | 85.9 | 5.7 | 3.45 | 12.88 | ❌ (\*) |

(\*) At 1× zoom culling skips almost nothing, so this row is mostly run-to-run noise. Its real effect is in the zoomed table above.

## 4. Final build: the ceiling

| Build | E/T/P | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms | heap MB |
|---|---|---|---|---|---|---|---|---|
| v1 [GPTSBC] | 5000/100/1000 | 60.0 | 16.8 | 100.0 | 0.0 | 0.48 | 1.88 | 9 |
| v1 [GPTSBC] | 10000/200/3000 | 60.0 | 16.8 | 100.0 | 0.0 | 2.06 | 9.76 | 18 |
| v1 [GPTSBC] | **12000/200/3000** | **60.0** | 16.7 | **100.0** | **0.0** | 2.55 | 10.36 | 7 |
| v1 [GPTSBC] | 14000/200/3000 | 55.4 | 33.3 | 91.7 | 3.2 | 3.28 | 11.48 | 17 |
| v1 [GPTSBC] | 16000/200/3000 | 46.2 | 33.4 | 71.0 | 11.3 | 4.71 | 12.42 | 10 |
| v1 [GPTSBC] | 16000/270/8000 | 25.0 | 50.1 | 0.0 | 59.5 | 19.10 | 19.42 | 9 |

At the ceiling, render (drawing 15k sprites) dominates. The next step would be a WebGL renderer (see [decisions.md D2](docs/decisions.md#d2--canvas-2d-no-game-engine)).

## 5. Memory over a complete 50-wave run

A scripted player (Gun/Frost/Cannon/Sniper mix on the best tiles, upgrading with spare gold) plays all 50 waves. Heap is sampled every 10 s of game time.

| Waves | Pools ON: heap min–max MB | Pools OFF: heap min–max MB |
|---|---|---|
| 1–6 | 1.9 – 2.8 | 1.9 – 3.0 |
| 6–11 | 2.1 – 2.8 | 2.2 – 2.9 |
| 11–16 | 2.2 – 3.0 | 2.3 – 3.1 |
| 16–21 | 2.3 – 3.1 | 2.4 – 3.2 |
| 21–26 | 2.4 – 3.2 | 2.5 – 4.4 |
| 26–31 | 2.5 – 3.3 | 2.9 – 4.5 |
| 31–36 | 2.7 – 3.6 | 2.8 – 4.6 |
| 36–41 | 2.9 – 4.5 | 3.0 – 4.9 |
| 41–46 | 3.0 – 4.8 | 3.3 – 7.0 |
| 46–50 | 3.1 – 5.0 | 3.6 – 7.4 |
| Result | Victory, 20 lives | Victory, 20 lives |

With pools the heap stays within about 2–5 MB for the whole run, with no growth trend. The small rise follows the larger late waves (more live enemies and particles), and it falls back when they die. Without pools the peaks are ~50% higher, because every shot, hit and effect allocates and leaves garbage for the GC.

## 6. Memory over a complete 50-wave run *during the stress scenario*

`npm run stress-memory`: the **50-wave stress run** (button in the Stress panel, or `?stress=5000,100,1000&waves=1`). Counts are held at 5,000 enemies / 100 towers / 1,000 projectiles while waves 1→50 advance every 6 s. Enemies are mortal, with each wave's real mix and HP, and every kill is replaced in the same tick, so spawning, killing and pooling churn at full load the whole time. It runs in real time at 1× (about 5 minutes), sampled every 5 s.

| Waves | heap min MB | heap max MB | FPS (avg) | ≥45 FPS % (worst 5 s window) | >33 ms % (worst 5 s window) | enemies killed so far |
|---|---|---|---|---|---|---|
| 1–5 | 3.7 | 6.0 | 60.0 | 99.7 | 0.3 | 90,477 |
| 6–10 | 3.0 | 4.3 | 60.0 | 99.7 | 0.0 | 120,129 |
| 11–15 | 3.0 | 5.6 | 60.0 | 100.0 | 0.0 | 128,663 |
| 16–20 | 3.5 | 6.1 | 60.0 | 100.0 | 0.0 | 133,803 |
| 21–25 | 3.0 | 6.1 | 60.0 | 100.0 | 0.0 | 138,152 |
| 26–30 | 3.8 | 5.5 | 60.0 | 100.0 | 0.0 | 141,297 |
| 31–35 | 3.8 | 6.1 | 60.0 | 100.0 | 0.0 | 143,663 |
| 36–40 | 3.7 | 5.8 | 60.0 | 100.0 | 0.0 | 145,639 |
| 41–45 | 3.0 | 5.8 | 60.0 | 100.0 | 0.0 | 147,090 |
| 46–50 | 3.0 | 5.8 | 60.0 | 100.0 | 0.0 | 148,786 |

**Whole run:** 59 windows · heap **3.0–6.1 MB, no trend** · mean ≥45 FPS **100.0%** · mean >33 ms **0.0%** · **148,786 enemies killed and replaced**. Memory and frame quality both hold for a complete 50-wave run at the stress load.

## 7. Refresh-rate independence

`npm run refresh-rate`: the real `Loop` is driven with synthetic `requestAnimationFrame` timestamps at each display rate, with the same towers, playing from wave 1 for 10,800 fixed steps (180 s of game time).

| Display Hz | frames rendered | wall-clock s to reach 180 s of game time | wave | gold | score | kills | lives | enemies alive | Σ enemy path distance |
|---|---|---|---|---|---|---|---|---|---|
| 30 | 5,401 | 180.00 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 60 | 10,802 | 180.02 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 75 | 13,501 | 180.00 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 120 | 21,601 | 180.00 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 144 | 25,922 | 180.01 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 165 | 29,701 | 180.00 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |
| 240 | 43,202 | 180.00 | 5 | 4226 | 6440 | 332 | 20 | 28 | 14017.100 |

Game speed and outcome are **identical at every refresh rate**. A faster screen only draws more frames of the same simulation.

**Smooth animation at high refresh rates.** The sim runs at 60 Hz, and the renderer draws enemies and projectiles at a position interpolated between the last two steps (`alpha = accumulator / step`). Per-frame on-screen movement of one Runner:

| Display Hz | No interpolation: frames with no movement | No interpolation: variation (CV) | **Interpolated:** frames with no movement | **Interpolated:** variation (CV) |
|---|---|---|---|---|
| 60 | 1% | 0.11 | 0% | 0.00 |
| 120 | 50% | 1.00 | 0% | 0.00 |
| 144 | 58% | 1.19 | 0% | 0.00 |
| 240 | 75% | 1.74 | 0% | 0.00 |

CV is the standard deviation divided by the mean of per-frame movement (0 = perfectly even). Without interpolation a 144 Hz screen shows enemies standing still on 58% of frames, then jumping. With it, every frame moves the same amount. Cost: 2 multiply-adds per entity. After adding it: 5000/100/1000 → 60 FPS, 100% ≥45 FPS, render 1.82 ms; 12000/200/3000 → 60 FPS, 100% ≥45 FPS.

## 8. Interactivity during the stress scenario

`npm run interactivity`: at 5000/100/1000, Chrome sends 31 real inputs: tower hotkeys, map clicks (place / select), Escape, the 2× button, pause/resume, and wheel zoom. The browser's Event Timing API reports, for each one, the time from input to the next painted frame (the measure behind INP; under 200 ms is "good").

| Build | FPS | inputs | median ms | p98 ms (≈ INP) | worst ms |
|---|---|---|---|---|---|
| **Final** | 60.0 | 31 | **24** | **32** | **32** |
| Naive v0 | 17.2 | 31 | 176 | 224 | 224 |

The final build answers every input within about two frames. The naive build is over the 200 ms "poor" threshold.
