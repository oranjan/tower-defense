# Progress

Build order and timings come from [PLAN.md §5](PLAN.md#5-build-order-do-it-in-this-order--the-naive-version-is-a-deliverable-not-a-draft). Times are IST on 2026-10-04. Hard stop at 17:00.

| Step | Planned | Status | Notes |
|---|---|---|---|
| 0. Plan | 09:00–13:10 | ✅ done 13:10 | [PLAN.md](PLAN.md) |
| 1. Skeleton + stats panel | 13:15–13:35 | ✅ done ~13:20 | Vite + TS, fixed-step loop, frame-stats ring buffer, on-screen panel |
| 2. Naive playable game | 13:35–14:50 | ✅ done ~13:25 | All gameplay requirements, written naively on purpose |
| 3. Stress mode + "before" numbers + naive deploy | 14:50–15:10 | ✅ done ~13:35 | Tag `v0-naive`, live at https://td-naive.vercel.app, numbers in [NUMBERS.md](../NUMBERS.md) |
| 3b. Documentation structure | — | ✅ done | README, AGENTS.md, docs/ |
| 4. Optimisations, each measured | 15:10–16:05 | ⏳ next | Order and toggles in [optimizations.md](performance/optimizations.md) |
| 5. Polish + balance pass | 16:05–16:25 | ☐ | Effects pooling, balance for waves 1–50 |
| 6. README/NUMBERS final + deploy final | 16:25–16:45 | ☐ | Project `td-final` |
| 7. Video + submit | 16:45–17:00 | ☐ | [video-script.md](video-script.md), form link in [PLAN.md](PLAN.md) |

## Known gaps

- **Balance is untuned.** In a fast-forwarded run with unlimited gold, all waves spawned and ran with no errors. A normal economy has not been play-tested past wave 1.
- **Numbers so far come from headless Chrome.** Real desktop Chrome numbers are still needed for NUMBERS.md and the video.
- **The `#bg` canvas exists but is unused.** It is reserved for the static-background optimisation.
