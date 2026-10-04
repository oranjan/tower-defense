# Rendering

## Layers

| Layer | Element | Contents |
|---|---|---|
| Background | `canvas#bg` | The static map, redrawn only when the camera changes (`useBgCache`). Unused in v0 |
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

## Optimised frame (`src/render.ts` `fast*` + `src/sprites.ts`)

All implemented behind flags. Details and numbers are in [performance/optimizations.md](performance/optimizations.md). The naive methods are still in `render.ts` (`naive*`) for when a flag is off.

1. **Static map cached in `#bg`:** drawn once, redrawn only on resize or zoom.
2. **Sprite atlas:** one offscreen canvas (4× resolution) holding every enemy type × {normal, slowed, flash}, the bullet, the shell and the tower bases, glow baked in. Each entity is a single `drawImage` from that one image.
3. **No per-entity state:** no `save/restore`, no `shadowBlur`, no text in the hot path. Turrets rotate via a computed `setTransform`.
4. **HP bars in two passes:** all red rects, then all green rects (2 `fillStyle` changes per frame). Skipped entirely when zoomed out past readability.
5. **Viewport culling:** skip any entity whose bounding box is outside `Camera.visible()`.
6. **HUD:** write text only when a value changes, at most 10 Hz.
7. **Not needed:** the PixiJS fallback. Canvas 2D holds 60 FPS at 5k (render 1.9 ms) and reaches 12k before failing (see [NUMBERS.md](../NUMBERS.md)).
