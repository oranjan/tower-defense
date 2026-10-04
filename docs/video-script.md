# Demo video script

## Mandatory (from the brief)

- 2–5 minutes, ideally 3–4. **Face on camera**, spoken in **English**, recorded with Loom or similar while using the **deployed** links.
- Show all three:
  1. The **breaking point of the naive build**: the E/T/P counts where FPS drops, *shown* in the browser, not just told.
  2. **How it was optimised.**
  3. **The final ceiling**, i.e. the delta.
- **In the first 30 s:** the first optimisation, before and after, *in action* (not just numbers).
- **For every optimisation:** before/after numbers derived live in the video. The same table goes in [NUMBERS.md](../NUMBERS.md).

## Script (target 3:30)

| Time | On screen | Say |
|---|---|---|
| 0:00–0:30 | Naive URL at S1 stuttering, then the final URL at the same S1 running smoothly (or flip `useGrid` off/on live). Point at the stats panel. | "This is the same 2,000 enemies. Before: X FPS, Y % of frames over 33 ms. After a spatial grid: …" |
| 0:30–1:15 | https://td-naive.vercel.app, raise the sliders until `≥45 FPS` falls under 95 %. | "The naive build breaks at about N enemies / T towers / P projectiles. Sim time explodes because every tower and bullet checks every enemy." |
| 1:15–2:45 | Each toggle: grid, pools (heap flat vs sawtooth), sprites/batching (render ms), culling (zoom in, toggle). | One sentence on *why* each one works, and read the numbers. |
| 2:45–3:15 | Final URL at 5000/100/1000: show ≥45 FPS on ≥95 % of frames and under 5 % of frames over 33 ms. Then push to the new ceiling. | "The requirement is met with headroom. The new ceiling is …" |
| 3:15–3:30 | Real gameplay: place, upgrade, sell, speed, a wave banner, a boss. | Wrap up. |

## Before recording

- [ ] Both URLs open in tabs; stats panel visible
- [ ] Chrome window 1440×900; other tabs closed
- [ ] Numbers already filled in [NUMBERS.md](../NUMBERS.md) as a fallback
- [ ] Camera and mic checked
- [ ] Submit the video link and repo/URLs at the form in [PLAN.md](PLAN.md)
