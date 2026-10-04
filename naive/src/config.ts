// Balance tables and world constants. Shared by every build so naive vs optimised numbers compare like for like.

export const TILE = 64;
export const COLS = 24;
export const ROWS = 14;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const START_GOLD = 220;
export const START_LIVES = 20;
export const WAVE_COUNT = 50;
export const WAVE_COUNTDOWN = 10; // seconds between the end of a wave's spawns and the next wave
export const SELL_RATIO = 0.7;
export const MAX_LEVEL = 3;

export interface TowerDef {
  name: string;
  cost: number;
  dmg: number;
  rate: number; // shots (or pulses) per second
  range: number;
  color: string;
  projSpeed: number; // 0 = no projectile (aura / hitscan)
  splash: number;
  slow: number; // fraction of speed removed
  slowDur: number;
  pierce: boolean; // ignores armor
  desc: string;
}

export const GUN = 0, CANNON = 1, FROST = 2, SNIPER = 3;

export const TOWERS: TowerDef[] = [
  { name: 'Gun', cost: 50, dmg: 8, rate: 5, range: 140, color: '#f5c542', projSpeed: 650, splash: 0, slow: 0, slowDur: 0, pierce: false, desc: 'Fast single-target. Weak vs armor.' },
  { name: 'Cannon', cost: 120, dmg: 40, rate: 0.8, range: 170, color: '#f97316', projSpeed: 380, splash: 60, slow: 0, slowDur: 0, pierce: false, desc: 'Slow shells, splash damage.' },
  { name: 'Frost', cost: 80, dmg: 3, rate: 2, range: 120, color: '#7dd3fc', projSpeed: 0, splash: 0, slow: 0.45, slowDur: 1.5, pierce: false, desc: 'Pulses slow every enemy in range.' },
  { name: 'Sniper', cost: 200, dmg: 120, rate: 0.4, range: 320, color: '#e879f9', projSpeed: 0, splash: 0, slow: 0, slowDur: 0, pierce: true, desc: 'Huge range, ignores armor.' },
];

// Per upgrade level (0..MAX_LEVEL)
export const towerDmg = (k: number, lvl: number) => TOWERS[k].dmg * Math.pow(1.35, lvl);
export const towerRange = (k: number, lvl: number) => TOWERS[k].range * Math.pow(1.1, lvl);
export const towerRate = (k: number, lvl: number) => TOWERS[k].rate * Math.pow(1.15, lvl);
export const upgradeCost = (k: number, toLvl: number) => Math.round(TOWERS[k].cost * 0.75 * toLvl);

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number; // px/s
  armor: number; // flat reduction per hit
  lives: number; // lives lost when it reaches the base
  reward: number;
  radius: number;
  color: string;
  slowResist: number; // multiplier on incoming slow (0.5 = half effect)
  points: number; // wave budget cost
}

export const RUNNER = 0, SWARM = 1, TANK = 2, SHIELDED = 3, BOSS = 4;

export const ENEMIES: EnemyDef[] = [
  { name: 'Runner', hp: 30, speed: 110, armor: 0, lives: 1, reward: 4, radius: 9, color: '#4ade80', slowResist: 1, points: 1 },
  { name: 'Swarm', hp: 10, speed: 90, armor: 0, lives: 1, reward: 1, radius: 6, color: '#facc15', slowResist: 1, points: 0.35 },
  { name: 'Tank', hp: 220, speed: 45, armor: 0, lives: 3, reward: 12, radius: 15, color: '#a78bfa', slowResist: 0.5, points: 5 },
  { name: 'Shielded', hp: 90, speed: 70, armor: 6, lives: 2, reward: 10, radius: 11, color: '#38bdf8', slowResist: 1, points: 3.5 },
  { name: 'Boss', hp: 600, speed: 35, armor: 8, lives: 10, reward: 150, radius: 22, color: '#f43f5e', slowResist: 0.5, points: 0 },
];
