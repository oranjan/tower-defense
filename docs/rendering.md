# Rendering

## Layers

| Layer | Element | Contents |
|---|---|---|
| Background | `canvas#bg` | Reserved for the cached static map (optimisation 5). Unused in v0 |
| World | `canvas#fg` | Map, towers, enemies, projectiles, particles, range rings, build ghost, wave banner |
| UI | DOM (`#hud`, `#side`, `.overlay`, `#stats`) | Text, buttons and sliders. The browser lays out text better than canvas `fillText`, and the DOM only changes when values change |

The canvas backing store is `css size × devicePixelRatio`, with DPR capped at 2. `Camera.apply()` sets one transform per frame (`scale × dpr` plus the pan offset), so all game code draws in world pixels.

## v0 naive frame (`src/render.ts`)

Written the "obvious" way on purpose:

1. Fill the whole canvas, apply the camera transform.
2. **Redraw the map from scratch:** 336 tile `fillRect`s, the road stroke, an optional grid, the base and the spawn marker.
3. **Towers:** each gets its own `save/translate/rotate/restore` and a `shadowBlur` glow.
4. **Enemies:** each gets its own `save()`, `shadowBlur = 8`, `beginPath/arc/fill`, a slow ring, a `font` string assignment, a `fillText` letter, two HP-bar `fillRect`s, and `restore()`. Every enemy is drawn, on screen or not.
5. **Projectiles:** each gets its own `save()`, a `shadowBlur` and an `arc`.
6. **Particles:** each gets its own `save()`, `globalAlpha` and arc/line/text.
7. **Screen space:** the wave banner (with `shadowBlur`).

The UI also rebuilds the HUD with `innerHTML` every frame.

Why this is slow, and how much each part costs, is covered in [performance/bottlenecks.md](performance/bottlenecks.md).

## Planned optimised frame

Details and status are in [performance/optimizations.md](performance/optimizations.md).

1. **Static map cached in `#bg`:** drawn once, redrawn only on resize or zoom.
2. **Pre-rendered sprites:** one offscreen canvas per enemy type and state (normal, flash), with the glow baked in. Each entity is then a single `drawImage`.
3. **Batch by type:** set the state once, loop over that type's entities. No `save/restore`, no `shadowBlur` and no text in the hot path.
4. **HP bars in two passes:** all red rects, then all green rects (2 `fillStyle` changes per frame). Skipped entirely when zoomed out past readability.
5. **Viewport culling:** skip any entity whose bounding box is outside `Camera.visible()`.
6. **HUD:** write text only when a value changes, at most 10 Hz.
7. **Fallback** if Canvas 2D can't hold 45 FPS at 5k sprites: swap only the renderer for PixiJS `ParticleContainer` (see [decisions.md](decisions.md)).
