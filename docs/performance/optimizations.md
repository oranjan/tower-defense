# Optimisations

Each optimisation gets **its own commit**, is measured before and after on the same scenario ([measurement.md](measurement.md)), and adds rows to [NUMBERS.md](../../NUMBERS.md). Where possible it sits behind a **runtime toggle** in the stats/stress panel, so the video can flip it live.

Status: ☐ planned · ⏳ in progress · ✅ done (link the commit)

| # | Optimisation | Fixes ([bottlenecks.md](bottlenecks.md)) | Toggle | Scenario | Status |
|---|---|---|---|---|---|
| 1 | Spatial grid for targeting, collision, splash and frost | Sim 1–3 | `useGrid` | S1 → S2 | ☐ |
| 2 | Object pools + swap-remove (no `new`, no `splice`) | Sim 5–6 | `usePool` | S1, heap graph | ☐ |
| 3 | SoA typed arrays for enemies and projectiles, cached path segment | Sim 4, 7 | build-level (v0 URL vs final URL) | S2 | ☐ |
| 4 | Pre-rendered sprites, batched by type; no save/restore, shadowBlur or text | Render 1–5 | `useSprites` | S2 | ☐ |
| 5 | Static background canvas + HUD updates only on change at ≤10 Hz | Render 6, 8 | `useBgCache` | S2 | ☐ |
| 6 | Viewport culling against `Camera.visible()` | Render 7 | `useCulling` | S2 zoomed in to 3× | ☐ |
| 7 | Towers query only when the cooldown is ready, and keep their target until it dies or leaves range | Sim 1 | `useTargetCache` | S2 with 200 towers | ☐ |

## Design notes

### 1. Spatial grid
- 64 px cells over the world, plus a margin. `cellStart: Int32Array(cells + 1)` and `items: Int32Array(cap)`.
- `rebuild()` every tick is a counting sort: count per cell → prefix sum → scatter. O(E), no allocation.
- `queryCircle(x, y, r, visit)` walks only the overlapping cells. With E spread over about 60 road tiles, a 140 px query touches about 9 cells instead of all 5000 enemies.
- Used by tower targeting, bullet collision, cannon splash and frost pulses: one structure, four beneficiaries.

### 2. Pools
- Free-list stack (`Int32Array`) plus a dense alive list with swap-remove. Release is O(1); nothing is ever `splice`d.
- Particles get a hard cap (e.g. 2,000). When full, the oldest is overwritten. Hit sparks are off in stress mode.
- Expect `>33 ms` to drop (no GC pauses) and the heap graph to go flat instead of a sawtooth.

### 3. Structure of Arrays
- Enemies: `x, y, s, hp, maxHp, speed, slowUntil, slowMul : Float32Array`; `kind, flags : Uint8Array`; `seg : Int32Array`. Capacity 16,384.
- Projectiles: `x, y, vx, vy, dmg, ttl, tx, ty, splash : Float32Array`; `kind : Uint8Array`. Capacity 8,192.
- `seg` caches the path segment, so `pointAt` advances forward instead of scanning from 0.
- Not toggleable at runtime (it changes the data model), so it's measured build vs build.

### 4. Sprites and batching
- At startup, each enemy type (normal and hit-flash), projectile type and tower base is drawn once into an offscreen canvas, with the glow baked in.
- Per frame: for each type, set nothing and loop `drawImage(sprite, x − r, y − r)`. HP bars go in two passes (red, then green).
- **Checkpoint:** if S2 render time is still above ~12 ms after this, apply the PixiJS fallback ([decisions.md D2](../decisions.md#d2--canvas-2d-no-game-engine)).

### 5. Static background + HUD
- The map is drawn once into `#bg`, redrawn only when the camera changes zoom or pan, or on resize.
- The HUD caches the last value of each field and writes `textContent` only on change, at most 10 times a second.

### 6. Viewport culling
- One AABB test per entity against the visible rect, plus a margin of the largest radius. Skipped entities cost a compare, not a draw.
- Demo: S2, zoom to 3×, toggle off and on. Render ms should drop roughly in proportion to the visible area.

### 7. Target caching
- If the cached target is alive and still in range, keep it. Only search (through the grid) when the cooldown is ready and there's no valid target.

## Results

Fill in after each optimisation, then copy the summary into [NUMBERS.md](../../NUMBERS.md).
