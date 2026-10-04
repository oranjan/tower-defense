# Demo video script

## Mandatory (from the brief)

- 2–5 minutes, ideally 3–4. **Face on camera**, spoken in **English**, recorded with Loom or similar while using the **deployed** links.
- Show all three:
  1. **The breaking point of the naive build**, shown in the browser.
  2. **How it was optimised.**
  3. **The final ceiling.**
- **In the first 30 s:** the first optimisation, before and after, *in action*.
- **For every optimisation:** before/after numbers derived live. The same tables are in [NUMBERS.md](../NUMBERS.md).

## Tabs to open before recording

1. https://td-naive.vercel.app/?stress=2000,50,500 (naive)
2. https://td-final-eight.vercel.app/?stress=5000,100,1000 (final; the Optimisations panel is in the right sidebar)
3. [NUMBERS.md](../NUMBERS.md) on GitHub, as a fallback

The stats panel (top-left) shows `FPS now`, `FPS avg`, `≥45 FPS %` and `>33 ms %` (the two numbers the brief grades), plus `sim` and `render` ms.

## Script (target ≈ 3:30)

| Time | On screen | Say (roughly) |
|---|---|---|
| **0:00–0:30** | Final tab at 5000/100/1000. Click **All off (naive)**: FPS drops to ~15 and `sim` jumps to ~55 ms. Tick **Spatial grid**: FPS jumps to ~55 and `sim` drops to ~1 ms. | "This is 5,000 enemies, 100 towers and 1,000 projectiles. With every optimisation off, every tower and bullet checks every enemy, so sim takes 55 ms and we're at 15 FPS. Turning on the spatial grid takes sim to about 1 ms." |
| 0:30–1:15 | Naive tab. Drag the **Enemies/Towers/Projectiles** sliders: 2000/50/500 is fine, 3000/75/750 drops `≥45 FPS` below 95%, and 5000/100/1000 is single-digit FPS. | "The original version holds 2,000 enemies but breaks at about 3,000/75/750. At the required load it's under 10 FPS. Sim time grows quadratically, and once frames are late it spirals." |
| 1:15–2:45 | Final tab, back to all off at 5000/100/1000. Tick the rest one by one, reading `sim` / `render` / `≥45 FPS` each time. **Pools:** removes allocation and `splice`. **Target caching:** sim −40%. **Sprite batching:** render 11 → 2 ms, 100% of frames ≥45 FPS. **Bg cache + HUD:** stops redrawing the static map and rebuilding the DOM every frame. **Culling:** zoom in with the wheel and toggle it; `drawn` goes 6,100 → ~1,700. | One sentence each on *why*. Mention the ablation: "switch any one of the grid, pools, target cache or sprites off at 12k enemies and we fail the 95% bar." |
| 2:45–3:15 | All on. Drag sliders up: 10,000/200/3,000 stays at 60, 12,000/200/3,000 still 100%, 14,000 starts to dip. | "The requirement is met with headroom. The new ceiling is about 12,000 enemies, 200 towers and 3,000 projectiles: 2.4× the target." Optionally click **50-wave stress run** for a few seconds: waves tick up at 5,000/100/1,000 and the heap stays flat (full 5-min run in NUMBERS.md §6: 3–6 MB, 100% ≥45 FPS). |
| 3:15–3:40 | **Menu → Play.** Place Guns and Frost, start the wave, upgrade one (`U`), sell one (`X`), set 4× speed, pause. | "And it's a real game: 50 waves, four towers, five enemy types including bosses, upgrades, selling, speed and pause." |

## Checklist

- [ ] Chrome window around 1440×900, other tabs closed, laptop plugged in
- [ ] Camera + mic on, face visible
- [ ] Read numbers off the panel live (don't just quote the table)
- [ ] Submit the video link, both URLs and the repo at the form in [PLAN.md](PLAN.md)
