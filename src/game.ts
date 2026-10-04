// NAIVE simulation — written the "obvious" way on purpose (this is the v0 baseline the video breaks):
//  - entities are class instances in plain arrays, removed with splice
//  - every tower scans every enemy every tick to find a target
//  - every projectile scans every enemy every tick for collisions
//  - `new` for every projectile and particle
import {
  CANNON, COLS, ENEMIES, FROST, GUN, MAX_LEVEL, ROWS, SELL_RATIO, SNIPER, START_GOLD, START_LIVES, TILE,
  TOWERS, WAVE_COUNT, WAVE_COUNTDOWN, towerDmg, towerRange, towerRate, upgradeCost,
} from './config';
import { PATH_LEN, TILE_KIND, inBounds, pointAt } from './map';
import { mulberry32 } from './rng';
import { buildWave, hpMul, waveBonus, type Spawn } from './waves';

export type Phase = 'menu' | 'playing' | 'victory' | 'gameover';

export class Enemy {
  x = 0;
  y = 0;
  s = 0;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  slowUntil = 0;
  slowMul = 1;
  flash = 0;
  constructor(public kind: number, hpScale: number) {
    const d = ENEMIES[kind];
    this.hp = this.maxHp = d.hp * hpScale;
    this.speed = d.speed;
    this.armor = d.armor;
  }
}

export class Tower {
  level = 0;
  cooldown = 0;
  angle = 0;
  target: Enemy | null = null;
  invested: number;
  kills = 0;
  x: number;
  y: number;
  constructor(public kind: number, public col: number, public row: number) {
    this.x = (col + 0.5) * TILE;
    this.y = (row + 0.5) * TILE;
    this.invested = TOWERS[kind].cost;
  }
  get dmg() { return towerDmg(this.kind, this.level); }
  get range() { return towerRange(this.kind, this.level); }
  get rate() { return towerRate(this.kind, this.level); }
}

export const BULLET = 0, SHELL = 1;

export class Projectile {
  constructor(
    public kind: number,
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public dmg: number,
    public ttl: number,
    public tx: number, // shell target point
    public ty: number,
    public splash: number,
    public owner: Tower | null,
  ) {}
}

export const P_DOT = 0, P_RING = 1, P_TEXT = 2, P_LINE = 3;

export class Particle {
  constructor(
    public kind: number,
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public life: number,
    public maxLife: number,
    public color: string,
    public size: number,
    public text = '',
    public x2 = 0,
    public y2 = 0,
  ) {}
}

export interface StressConfig {
  enemies: number;
  towers: number;
  projectiles: number;
}

const tmp = { x: 0, y: 0 };

export class Game {
  phase: Phase = 'menu';
  paused = false;
  gold = START_GOLD;
  lives = START_LIVES;
  score = 0;
  wave = 0; // waves started so far
  time = 0;
  kills = 0;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  occupied: (Tower | null)[] = new Array(COLS * ROWS).fill(null);

  spawnQueue: Spawn[] = [];
  spawnIdx = 0;
  waveTime = 0;
  waveActive = false;
  countdown = -1; // seconds until next wave; -1 = waiting for the player
  bannerTime = 0;
  baseHit = 0;

  stress: StressConfig | null = null;
  rng = mulberry32(42);

  reset() {
    this.phase = 'menu';
    this.paused = false;
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.score = 0;
    this.wave = 0;
    this.time = 0;
    this.kills = 0;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.occupied = new Array(COLS * ROWS).fill(null);
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveActive = false;
    this.countdown = -1;
    this.bannerTime = 0;
    this.stress = null;
    this.rng = mulberry32(42);
  }

  start() {
    this.reset();
    this.phase = 'playing';
  }

  // ---------- waves ----------

  nextWaveReady() {
    return this.phase === 'playing' && !this.stress && !this.waveActive && this.wave < WAVE_COUNT;
  }

  earlyBonus() {
    return this.countdown > 0 ? Math.floor(this.countdown * 2 + this.wave) : 0;
  }

  callNextWave() {
    if (!this.nextWaveReady()) return;
    const bonus = this.earlyBonus();
    this.gold += bonus;
    this.score += bonus;
    this.wave++;
    this.spawnQueue = buildWave(this.wave);
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveActive = true;
    this.countdown = -1;
    this.bannerTime = 2.5;
  }

  spawnEnemy(kind: number, scale: number, s = 0) {
    const e = new Enemy(kind, scale);
    e.s = s;
    pointAt(s, e);
    this.enemies.push(e);
    return e;
  }

  // ---------- building ----------

  canPlace(kind: number, col: number, row: number) {
    return (
      inBounds(col, row) &&
      TILE_KIND[row * COLS + col] === 0 &&
      !this.occupied[row * COLS + col] &&
      (this.stress !== null || this.gold >= TOWERS[kind].cost)
    );
  }

  place(kind: number, col: number, row: number) {
    if (!this.canPlace(kind, col, row)) return null;
    const t = new Tower(kind, col, row);
    if (!this.stress) this.gold -= TOWERS[kind].cost;
    this.towers.push(t);
    this.occupied[row * COLS + col] = t;
    this.burst(t.x, t.y, TOWERS[kind].color, 10, 80);
    return t;
  }

  towerAt(col: number, row: number) {
    return inBounds(col, row) ? this.occupied[row * COLS + col] : null;
  }

  nextUpgradeCost(t: Tower) {
    return t.level >= MAX_LEVEL ? Infinity : upgradeCost(t.kind, t.level + 1);
  }

  upgrade(t: Tower) {
    const c = this.nextUpgradeCost(t);
    if (c === Infinity || this.gold < c) return false;
    this.gold -= c;
    t.invested += c;
    t.level++;
    this.burst(t.x, t.y, '#ffffff', 14, 120);
    return true;
  }

  sellValue(t: Tower) {
    return Math.floor(t.invested * SELL_RATIO);
  }

  sell(t: Tower) {
    this.gold += this.sellValue(t);
    this.towers.splice(this.towers.indexOf(t), 1);
    this.occupied[t.row * COLS + t.col] = null;
    this.floatText(t.x, t.y - 10, '+' + this.sellValue(t), '#f5c542');
  }

  // ---------- simulation ----------

  update(dt: number) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    if (this.bannerTime > 0) this.bannerTime -= dt;
    if (this.baseHit > 0) this.baseHit -= dt;

    if (!this.stress) this.updateWaves(dt);
    this.updateEnemies(dt);
    for (let i = 0; i < this.towers.length; i++) this.updateTower(this.towers[i], dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    if (this.stress) this.topUpProjectiles();

    if (this.lives <= 0 && !this.stress) {
      this.lives = 0;
      this.phase = 'gameover';
    } else if (!this.stress && this.wave === WAVE_COUNT && !this.waveActive && this.enemies.length === 0) {
      this.score += this.gold;
      this.phase = 'victory';
    }
  }

  private updateWaves(dt: number) {
    if (this.waveActive) {
      this.waveTime += dt;
      const scale = hpMul(this.wave);
      while (this.spawnIdx < this.spawnQueue.length && this.spawnQueue[this.spawnIdx].t <= this.waveTime) {
        const kind = this.spawnQueue[this.spawnIdx].kind;
        this.spawnEnemy(kind, scale);
        this.spawnIdx++;
      }
      if (this.spawnIdx >= this.spawnQueue.length) {
        this.waveActive = false;
        const b = waveBonus(this.wave);
        this.gold += b;
        this.score += b;
        if (this.wave < WAVE_COUNT) this.countdown = WAVE_COUNTDOWN;
      }
    } else if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.callNextWave();
      }
    }
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const mul = this.time < e.slowUntil ? e.slowMul : 1;
      e.s += e.speed * mul * dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.s >= PATH_LEN) {
        if (this.stress) {
          e.s -= PATH_LEN;
        } else {
          this.lives -= ENEMIES[e.kind].lives;
          this.baseHit = 0.3;
          this.enemies.splice(i, 1);
          continue;
        }
      }
      pointAt(e.s, e);
    }
  }

  private updateTower(t: Tower, dt: number) {
    t.cooldown -= dt;
    const range = t.range;
    const r2 = range * range;

    // Scan every enemy for the one furthest along the path within range
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      const dx = e.x - t.x, dy = e.y - t.y;
      if (dx * dx + dy * dy <= r2 && (!best || e.s > best.s)) best = e;
    }
    t.target = best;
    if (!best) return;
    t.angle = Math.atan2(best.y - t.y, best.x - t.x);
    if (t.cooldown > 0) return;

    const def = TOWERS[t.kind];
    if (t.kind === FROST) {
      t.cooldown = 1 / t.rate;
      const dmg = t.dmg;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= r2) {
          e.slowUntil = this.time + def.slowDur;
          e.slowMul = 1 - def.slow * ENEMIES[e.kind].slowResist;
          this.damage(e, dmg, false, t);
        }
      }
      this.particles.push(new Particle(P_RING, t.x, t.y, 0, 0, 0.4, 0.4, def.color, range));
      return;
    }

    if (this.stress && this.projectiles.length >= this.stress.projectiles && t.kind !== SNIPER) return;
    t.cooldown = 1 / t.rate;

    if (t.kind === SNIPER) {
      this.particles.push(new Particle(P_LINE, t.x, t.y, 0, 0, 0.15, 0.15, def.color, 2, '', best.x, best.y));
      this.damage(best, t.dmg, true, t);
      return;
    }

    // Lead the target: aim where it will be when the projectile arrives
    const dist = Math.hypot(best.x - t.x, best.y - t.y);
    const tt = dist / def.projSpeed;
    const mul = this.time < best.slowUntil ? best.slowMul : 1;
    pointAt(best.s + best.speed * mul * tt, tmp);
    const ax = tmp.x - t.x, ay = tmp.y - t.y;
    const al = Math.hypot(ax, ay) || 1;
    const vx = (ax / al) * def.projSpeed, vy = (ay / al) * def.projSpeed;
    if (t.kind === GUN) {
      this.projectiles.push(new Projectile(BULLET, t.x, t.y, vx, vy, t.dmg, (range * 1.3) / def.projSpeed, 0, 0, 0, t));
    } else if (t.kind === CANNON) {
      this.projectiles.push(new Projectile(SHELL, t.x, t.y, vx, vy, t.dmg, al / def.projSpeed, tmp.x, tmp.y, def.splash, t));
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;

      if (p.kind === SHELL) {
        if (p.ttl <= 0) {
          this.explode(p);
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      // Bullet: test against every enemy
      let hit: Enemy | null = null;
      for (const e of this.enemies) {
        const r = ENEMIES[e.kind].radius + 3;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy <= r * r) {
          hit = e;
          break;
        }
      }
      if (hit) {
        this.damage(hit, p.dmg, false, p.owner);
        this.particles.push(new Particle(P_DOT, p.x, p.y, 0, 0, 0.15, 0.15, '#fff7c2', 3));
        this.projectiles.splice(i, 1);
      } else if (p.ttl <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private explode(p: Projectile) {
    const r2 = p.splash * p.splash;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.x - p.tx, dy = e.y - p.ty;
      if (dx * dx + dy * dy <= r2) this.damage(e, p.dmg, false, p.owner);
    }
    this.particles.push(new Particle(P_RING, p.tx, p.ty, 0, 0, 0.3, 0.3, '#fb923c', p.splash));
    this.burst(p.tx, p.ty, '#fdba74', 8, 140);
  }

  damage(e: Enemy, dmg: number, pierce: boolean, by: Tower | null) {
    if (e.hp <= 0) return;
    e.hp -= pierce ? dmg : Math.max(1, dmg - e.armor);
    e.flash = 0.08;
    if (e.hp > 0) return;
    if (this.stress) {
      e.hp = e.maxHp; // stress mode holds the enemy count constant
      return;
    }
    const d = ENEMIES[e.kind];
    this.gold += d.reward;
    this.score += d.reward * 10;
    this.kills++;
    if (by) by.kills++;
    this.burst(e.x, e.y, d.color, 6, 90);
    this.floatText(e.x, e.y - 8, '+' + d.reward, '#f5c542');
    this.enemies.splice(this.enemies.indexOf(e), 1);
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push(new Particle(P_DOT, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45, 0.45, color, 2.5));
    }
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.particles.push(new Particle(P_TEXT, x, y, 0, -30, 0.9, 0.9, color, 12, text));
  }

  // ---------- stress mode ----------

  startStress(cfg: StressConfig) {
    this.reset();
    this.phase = 'playing';
    this.stress = { ...cfg };
    this.gold = 0;
    this.lives = 999;
    this.setStress(cfg);
  }

  // Adjust live counts to match the config (sliders call this)
  setStress(cfg: StressConfig) {
    if (!this.stress) return;
    this.stress = { ...cfg };
    const scale = hpMul(25);
    while (this.enemies.length > cfg.enemies) this.enemies.pop();
    while (this.enemies.length < cfg.enemies) {
      this.spawnEnemy(this.enemies.length % 4, scale, this.rng() * PATH_LEN);
    }
    while (this.towers.length > cfg.towers) {
      const t = this.towers.pop()!;
      this.occupied[t.row * COLS + t.col] = null;
    }
    if (this.towers.length < cfg.towers) {
      const free: number[] = [];
      for (let i = 0; i < COLS * ROWS; i++) if (TILE_KIND[i] === 0 && !this.occupied[i]) free.push(i);
      // deterministic shuffle so layouts repeat between runs
      const r = mulberry32(7);
      for (let i = free.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [free[i], free[j]] = [free[j], free[i]];
      }
      let k = 0;
      while (this.towers.length < cfg.towers && k < free.length) {
        const idx = free[k++];
        const t = this.place(this.towers.length % 4, idx % COLS, Math.floor(idx / COLS));
        if (t) t.level = this.towers.length % (MAX_LEVEL + 1);
      }
    }
    while (this.projectiles.length > cfg.projectiles) this.projectiles.pop();
  }

  private topUpProjectiles() {
    const want = this.stress!.projectiles;
    const n = this.enemies.length;
    while (this.projectiles.length < want) {
      const t = this.towers.length ? this.towers[Math.floor(this.rng() * this.towers.length)] : null;
      const x = t ? t.x : this.rng() * COLS * TILE;
      const y = t ? t.y : this.rng() * ROWS * TILE;
      // aim at a random enemy (or anywhere on the map if there are none)
      const e = n > 0 ? this.enemies[Math.floor(this.rng() * n)] : null;
      const tx = e ? e.x : this.rng() * COLS * TILE;
      const ty = e ? e.y : this.rng() * ROWS * TILE;
      const d = Math.hypot(tx - x, ty - y) || 1;
      this.projectiles.push(new Projectile(BULLET, x, y, ((tx - x) / d) * 650, ((ty - y) / d) * 650, 8, d / 650 + 0.05, 0, 0, 0, t));
    }
  }
}
