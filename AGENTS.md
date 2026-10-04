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
| [docs/performance/optimizations.md](docs/performance/optimizations.md) | Planned and finished optimisations, their toggles and status |
| [NUMBERS.md](NUMBERS.md) | The before/after table. **Required by the brief, must stay at repo root** |
| [docs/deployment.md](docs/deployment.md) | Vercel projects, URLs, deploy commands, CLI workaround |
| [docs/video-script.md](docs/video-script.md) | The demo video script and its mandatory beats |

## Commands

```bash
npm run dev                      # Vite dev server
npm run build                    # tsc type-check + production build to dist/
npm run bench -- <url> E,T,P …   # headless stress benchmark, prints NUMBERS.md rows
```

Quick stress from the URL: `?stress=5000,100,1000`. In the console, `game` is the live `Game` instance and `statsRow()` returns the current stats as a markdown row.

## Code map

```
src/
  main.ts        bootstrap, input, stats panel, wiring
  loop.ts        single rAF loop, fixed 1/60 s simulation step
  game.ts        all simulation: entities, waves, combat, economy, stress mode
  render.ts      canvas renderer
  ui.ts          DOM HUD, shop, tower panel, stress sliders, overlays
  camera.ts      pan/zoom, world↔screen, visible rect
  map.ts         path polyline, tile kinds, pointAt(s)
  waves.ts       50-wave generator
  config.ts      every balance number and world constant
  rng.ts         seeded mulberry32
  bench/stats.ts frame-time ring buffer → FPS / p95 / % frames
scripts/bench.mjs  headless benchmark (puppeteer-core + local Chrome)
```

## Rules

1. **Git identity.** Commit as `oranjan <rnjnmhta@gmail.com>` with all four `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars set inline. **No Claude/AI attribution** in commits or PRs. Short, human commit messages. Check `git log -1` after committing.
2. **The `v0-naive` tag is frozen.** It is the deployed baseline the video breaks. Never "fix" its slowness. Optimisations go on top, behind runtime toggles where possible ([optimizations.md](docs/performance/optimizations.md)).
3. **One optimisation per commit**, measured before and after with the same scenario ([measurement.md](docs/performance/measurement.md)). Paste the rows into [NUMBERS.md](NUMBERS.md).
4. **No allocation in the hot loop** in optimised code paths: no `new`, closures, `splice`, array spreads or string building per entity per frame.
5. **Simulation never reads wall-clock time.** It only advances through `Game.update(STEP)`. Rendering must not mutate game state.
6. **Balance numbers live in `src/config.ts`** (and wave formulas in `src/waves.ts`). Never hard-code them elsewhere.
7. **Keep docs current.** When you change behaviour, update the matching doc in the same commit, add a [decisions.md](docs/decisions.md) entry for any new choice, and tick [progress.md](docs/progress.md).
8. **Deploy** only under the `oranjan` Vercel account. Run `vercel whoami` first. See [deployment.md](docs/deployment.md).
