import { BOSS, ENEMIES, RUNNER, SHIELDED, SWARM, TANK } from './config';
import { mulberry32 } from './rng';

export interface Spawn {
  t: number; // seconds after wave start
  kind: number;
}

export const hpMul = (n: number) => 1 + 0.2 * n + 0.025 * n * n; // w1 1.2x, w25 21x, w50 74x
export const budget = (n: number) => 15 + 7 * n + 0.3 * n * n;
export const spawnGap = (n: number) => Math.max(0.12, 0.6 - 0.01 * n);
export const waveBonus = (n: number) => 25 + 5 * n;
// Kill rewards shrink as waves grow so the economy can't outscale the HP curve (w1 ×0.96, w25 ×0.5, w50 ×0.33)
export const rewardMul = (n: number) => 1 / (1 + 0.04 * n);
export const isBossWave = (n: number) => n % 10 === 0;

const UNLOCK = [
  [RUNNER, 1],
  [SWARM, 3],
  [TANK, 6],
  [SHIELDED, 9],
];

// Deterministic composition for wave n (1-based): groups of one type, weighted toward newly unlocked types.
export function buildWave(n: number): Spawn[] {
  const rng = mulberry32(1000 + n);
  const out: Spawn[] = [];
  const gap = spawnGap(n);
  let left = budget(n);
  let t = 0;

  if (isBossWave(n)) {
    left *= 0.6; // the boss takes part of the budget
  }

  while (left > 0) {
    let total = 0;
    const weights: number[] = [];
    for (const [, from] of UNLOCK) {
      const w = n < from ? 0 : n - from < 3 ? 3 : 1;
      weights.push(w);
      total += w;
    }
    let pick = rng() * total;
    let kind = RUNNER;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        kind = UNLOCK[i][0];
        break;
      }
    }

    const swarm = kind === SWARM;
    const count = swarm ? 8 + Math.floor(rng() * 13) : 3 + Math.floor(rng() * 6);
    const g = swarm ? 0.08 : gap;
    for (let i = 0; i < count && left > 0; i++) {
      out.push({ t, kind });
      left -= ENEMIES[kind].points;
      t += g;
    }
    t += gap * 3;
  }

  if (isBossWave(n)) out.push({ t: t + 1, kind: BOSS });
  return out;
}
