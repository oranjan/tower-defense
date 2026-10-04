# Progress

Build order and timings come from [PLAN.md §5](PLAN.md#5-build-order-do-it-in-this-order--the-naive-version-is-a-deliverable-not-a-draft). Times are IST on 2026-10-04. Hard stop at 17:00.

| Step | Planned | Status | Notes |
|---|---|---|---|
| 0. Plan | 09:00–13:10 | ✅ 13:10 | [PLAN.md](PLAN.md) |
| 1. Skeleton + stats panel | 13:15–13:35 | ✅ ~13:20 | Vite + TS, fixed-step loop, frame-stats ring buffer, on-screen panel |
| 2. Naive playable game | 13:35–14:50 | ✅ ~13:25 | All gameplay requirements, written naively on purpose |
| 3. Stress mode + "before" numbers + naive deploy | 14:50–15:10 | ✅ ~13:35 | Tag `v0-naive`; https://td-naive.vercel.app |
| 3b. Documentation structure | — | ✅ | README, AGENTS.md, docs/ |
| 4. Optimisations, each measured | 15:10–16:05 | ✅ ~15:10 | 6 live toggles; SoA skipped on evidence (D19). [optimizations.md](performance/optimizations.md) |
| 4b. Frozen naive copy at `/naive/` | — | ✅ | `naive/` folder, second Vite page (D21) |
| 5. Polish + balance | 16:05–16:25 | ✅ ~15:20 | Balance tuned with a scripted bot (D22). Live "FPS now". Stress HUD shows the scenario. Sound skipped at the user's request (D24) |
| 6. NUMBERS/README/docs + final deploy | 16:25–16:45 | ✅ ~15:30 | https://td-final-eight.vercel.app (+ `/naive/`); `npm run report` / `npm run memory` |
| 6b. Brief audit: proofs for every performance bullet | — | ✅ ~15:55 | 50-wave stress run (D25), refresh-rate test, interactivity test, decisions listed in README. NUMBERS.md §6–8 |
| 6c. Smooth animation + short README | — | ✅ | Render interpolation (D26) |
| 7. Video + submit | 16:45–17:00 | ☐ user | [video-script.md](video-script.md); form link in [PLAN.md](PLAN.md) |

## Known gaps

- **All numbers come from headless Chrome.** The video re-derives them live in desktop Chrome on the deployed URLs.
- **Sound files are in `sounds/` but not wired in** (user's call). The audio manager design is in D24 if it's wanted later.
- **SoA typed arrays were not implemented** (D19).
