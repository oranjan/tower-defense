# AGENTS.md

Entry point for any AI agent (Claude Code, Codex, Cursor, …) working in this repo. Read this first, then open only the doc you need.

## What this is

A browser tower defense game built for the Cactro take-home (brief: [docs/assignment.png](docs/assignment.png)). **Deadline: 2026-10-04 17:00 IST.**
The grading is less about having a game than about **showing the naive build break under load, then each optimisation's measured before/after, then the final ceiling**. Every task should serve that story.

## Doc map

| Doc | Read it when you need… |
|---|---|
| [README.md](README.md) | The public summary: what it is, live links, how to run, short versions of each required section |
| [docs/PLAN.md](docs/PLAN.md) | The original build plan: timeline, build order, cut list. **Source of truth for scope** |
| [docs/progress.md](docs/progress.md) | What's done, what's next, timestamps. **Update it when you finish a step** |
| [docs/architecture.md](docs/architecture.md) | Module layout, game loop, state machine, data model, stress mode internals |
| [docs/game-design.md](docs/game-design.md) | Tower/enemy stats, wave formula, economy, controls |
| [docs/rendering.md](docs/rendering.md) | How a frame is drawn (naive now, optimised later) |
| [docs/decisions.md](docs/decisions.md) | Every design decision with the reason and the alternatives rejected. **Add an entry for every new decision** |
| [docs/performance/measurement.md](docs/performance/measurement.md) | Stats panel metric definitions, stress mode rules, benchmark protocol, `npm run bench` |
| [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md) | Where the naive build spends its time, with numbers |
| [docs/performance/optimizations.md](docs/performance/optimizations.md) | What each optimisation does, its flag and its measured effect |
| [NUMBERS.md](NUMBERS.md) | The before/after table. **Required by the brief, must stay at repo root** |
| [docs/deployment.md](docs/deployment.md) | Vercel projects, URLs, deploy commands, CLI workaround |
| [docs/video-script.md](docs/video-script.md) | The demo video script and its mandatory beats |

## Commands

```bash
npm run dev                          # Vite dev server (final at /, naive at /naive/)
npm run build                        # tsc type-check + production build of both pages to dist/
npx vite preview --port 4317         # serve dist/ for measurement
npm run report -- <url>              # every NUMBERS.md table (headless Chrome)
npm run memory -- <url> [nopool]     # 50-wave heap run
npm run bench -- <url> E,T,P …       # quick rows
npm run stress-memory -- <url>       # 50-wave run at 5000/100/1000 (~5 min)
npm run refresh-rate -- <url>        # determinism across 30–240 Hz
npm run interactivity -- <url>       # input → next paint under stress
```

**URL params:**
- `?stress=E,T,P` starts a stress test (add `&waves=1` for the 50-wave stress run)
- `?naive=1` turns every optimisation off
- `?off=grid,pool,target,sprites,bg,culling` turns specific ones off

**Console globals:** `game`, `flags`, `cam`, `ui`, `statsRow()`, `resetStats()`.

**Live:** https://td-final-eight.vercel.app (and `/naive/`) · https://td-naive.vercel.app

## Code map

```
src/
  main.ts        bootstrap, input, stats panel, wiring
  loop.ts        single rAF loop, fixed 1/60 s simulation step
  flags.ts       runtime optimisation toggles (G P T S B C)
  game.ts        simulation: entities, pools, waves, combat, economy, stress mode, event counters
  grid.ts        spatial grid (counting sort)
  render.ts      canvas renderer: fast* paths and naive* paths
  sprites.ts     sprite atlas
  ui.ts          DOM HUD, shop, tower panel, optimisation toggles, stress sliders, overlays
  camera.ts      pan/zoom, world↔screen, visible rect, change detection
  map.ts         path polyline, tile kinds, pointAt(s)
  waves.ts       50-wave generator + difficulty/reward curves
  config.ts      every balance number and world constant
  rng.ts         seeded mulberry32
  bench/stats.ts frame-time ring buffer → FPS / p95 / % frames
naive/           FROZEN v0 copy (own index.html + src/), second Vite page at /naive/
scripts/         report · memory · stress-memory · refresh-rate · interactivity · bench (.mjs)
sounds/          supplied sound effects, not wired in (decisions D24)
```

## Rules

1. **Git identity.** Commit as `oranjan <rnjnmhta@gmail.com>` with all four `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars set inline. **No Claude/AI attribution** in commits or PRs. Short, human commit messages. Check `git log -1` after committing.
2. **`naive/` and the `v0-naive` tag are frozen.** They are the baseline the video breaks. Never "fix" their slowness; only measurement or display hooks may change there (D21). New optimisations go in `src/` behind a flag in `flags.ts` ([optimizations.md](docs/performance/optimizations.md)).
3. **Measure every performance change** with `npm run report` on a production build ([measurement.md](docs/performance/measurement.md)) and update [NUMBERS.md](NUMBERS.md).
4. **No allocation in the hot loop** in optimised code paths: no `new`, closures, `splice`, array spreads or string building per entity per frame.
5. **Simulation never reads wall-clock time.** It only advances through `Game.update(STEP)`. Rendering must not mutate game state.
6. **Balance numbers live in `src/config.ts`** (and wave formulas in `src/waves.ts`). Never hard-code them elsewhere.
7. **Keep docs current.** When you change behaviour, update the matching doc in the same commit, add a [decisions.md](docs/decisions.md) entry for any new choice, and tick [progress.md](docs/progress.md).
8. **Deploy** only under the `oranjan` Vercel account. Run `vercel whoami` first. See [deployment.md](docs/deployment.md).
