# Game design

All numbers live in [`src/config.ts`](../src/config.ts) and [`src/waves.ts`](../src/waves.ts). Update this page when you change them.

## Map

The map is 24×14 tiles of 64 px (a 1536×896 world). One S-shaped road enters off-map on the left at row 2 and snakes down to the **base** at tile (21, 12). It is about 62 tiles (≈ 3,970 px) long. A Runner takes about 36 s to walk it. Every non-road tile is buildable.

## Towers

| Tower | Cost | Damage | Rate /s | Range px | Special | Role |
|---|---|---|---|---|---|---|
| Gun | 50 | 8 | 5 | 140 | — | Cheap DPS vs Runners and Swarms; weak vs armor |
| Cannon | 120 | 40 | 0.8 | 170 | 60 px splash | Groups and Tanks |
| Frost | 80 | 3 | 2 pulses | 120 | Each pulse slows everything in range by 45% for 1.5 s | Force multiplier |
| Sniper | 200 | 120 | 0.4 | 320 | Hitscan; ignores armor | Shielded enemies and Bosses |

- **Upgrades:** 3 levels above base (levels shown as 1–4). Each level gives ×1.35 damage, ×1.10 range and ×1.15 rate. Going to level k costs `round(cost × 0.75 × k)`.
- **Sell** refunds 70% of everything invested.
- **Targeting:** "first" (the enemy furthest along the path within range). Guns and Cannons lead their target by predicting where it will be when the projectile arrives.

## Enemies

| Enemy | HP | Speed px/s | Armor | Lives lost | Reward | Notes |
|---|---|---|---|---|---|---|
| Runner | 30 | 110 | 0 | 1 | 4 | Fast, fragile |
| Swarm | 10 | 90 | 0 | 1 | 1 | Comes in bursts of 8–20 |
| Tank | 220 | 45 | 0 | 3 | 12 | Slows only half as much |
| Shielded | 90 | 70 | 6 | 2 | 10 | Guns barely scratch it |
| Boss | 600 | 35 | 8 | 10 | 150 | Waves 10/20/30/40/50; slows only half as much |

Base HP is multiplied by `hpMul(wave)`. **Damage per hit:** `max(1, dmg − armor)`, except the Sniper, which ignores armor.

## Waves (50)

| Formula | Value |
|---|---|
| `hpMul(n) = 1 + 0.10n + 0.004n²` | wave 1 ×1.1, wave 25 ×6, wave 50 ×16 |
| `budget(n) = 15 + 6n + 0.25n²` | Points spent on enemies (Runner 1, Swarm 0.35, Tank 5, Shielded 3.5) |
| `spawnGap(n) = max(0.12, 0.6 − 0.01n)` s | Gap between enemies in a group (Swarm bursts use 0.08 s) |
| `waveBonus(n) = 25 + 5n` | Gold and score when a wave finishes spawning |

- **Unlocks:** Runner from wave 1, Swarm from 3, Tank from 6, Shielded from 9. A newly unlocked type gets 3× pick weight for 3 waves.
- **Boss waves** (every 10th) spend only 60% of the budget on normal enemies, and the Boss arrives last.
- **Generation:** each wave is built from groups of one type, seeded with `1000 + n`, so wave n is identical on every play.

**Flow:** wave 1 starts when the player clicks or presses `N`. After a wave finishes spawning, a 10 s countdown starts the next one. Calling it early pays `floor(secondsLeft × 2 + wave)` gold.

## Economy and scoring

- Start with **220 gold** and **20 lives**.
- A kill gives its reward in gold, plus reward × 10 to score. Wave bonuses and early-call bonuses add to both.
- **Victory:** wave 50 has finished spawning and no enemies remain. Leftover gold is added to the score.
- **Game over:** lives reach 0.

## Controls

| Input | Action |
|---|---|
| Click a buildable tile (with a tower type selected) | Build |
| Click a tower | Select it (shows range, stats, upgrade/sell) |
| `1`–`4` / shop buttons | Choose tower type (press again to cancel) |
| `U` / `X` (or Delete) | Upgrade / sell the selected tower |
| `N` / Enter | Start or call the next wave |
| `Space` | Pause / resume |
| `R` | Restart |
| `+` / `-`, 1×/2×/4× buttons | Game speed |
| Wheel, drag, WASD/arrows, `0` | Zoom, pan, reset zoom |
| `Esc` / right click | Cancel build mode or selection |

## Balance status

Not tuned yet (Step 5 in [PLAN.md](PLAN.md)). Aim: a casual build survives to about wave 30, and Frost + Cannon synergy plus Snipers are needed for the bosses.
