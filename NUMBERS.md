# Performance numbers

Scenario = enemies / towers / projectiles (E/T/P), held constant by stress mode (enemies wrap around and are immortal, projectiles are topped up). Every run is at 1× speed with a 5 s warm-up; values come from the in-game stats panel ("Copy stats row"). Full protocol and metric definitions: [docs/performance/measurement.md](docs/performance/measurement.md). What makes v0 slow: [docs/performance/bottlenecks.md](docs/performance/bottlenecks.md).

`≥45 FPS` = % of frames with an interval ≤ 22.2 ms (the requirement is ≥ 95 %). `>33 ms` = % of frames slower than 33 ms (the requirement is < 5 %).

## v0 — naive baseline

Headless Chrome on an Apple Silicon Mac, 1440×900 (indicative; the video re-derives these live in desktop Chrome):

| Build | E/T/P | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms |
|---|---|---|---|---|---|---|---|
| v0 naive | 1000/30/300 | 60.0 | 16.8 | 100.0 | 0.0 | 1.12 | 1.83 |
| v0 naive | 2000/50/500 | 60.0 | 16.7 | 100.0 | 0.0 | 3.00 | 3.11 |
| v0 naive | 3000/75/750 | 60.0 | 16.7 | 100.0 | 0.0 | 6.93 | 4.58 |
| v0 naive | 3500/85/850 | 52.6 | 33.3 | 86.3 | 3.3 | 9.85 | 6.08 |
| v0 naive | 4000/90/900 | 36.2 | 33.4 | 34.4 | 22.8 | 17.37 | 6.62 |
| v0 naive | **5000/100/1000** | **10.0** | **133.3** | **5.7** | **92.5** | **89.64** | **8.21** |

Breaking point (first scenario under 95 % of frames at ≥45 FPS): **~3500/85/850**.

## Optimisations

| # | Optimisation | E/T/P | Before FPS | Before p95 ms | Before >33 ms % | After FPS | After p95 ms | After >33 ms % |
|---|---|---|---|---|---|---|---|---|
| 1 | Spatial grid | | | | | | | |
| 2 | Pooling | | | | | | | |
| 3 | SoA typed arrays | | | | | | | |
| 4 | Batched sprites | | | | | | | |
| 5 | Bg cache + HUD throttle | | | | | | | |
| 6 | Culling (zoomed in) | | | | | | | |
| F | Final ceiling | | | | | | | |
