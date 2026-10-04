// Simulation. Every optimisation sits behind a flag in flags.ts; with all flags off this behaves exactly
// like the v0 naive build (scan-everything targeting/collision, `new` + `splice` everywhere).
import {
  CANNON, COLS, ENEMIES, FROST, GUN, MAX_LEVEL, ROWS, SELL_RATIO, SNIPER, START_GOLD, START_LIVES, TILE,
  TOWERS, WAVE_COUNT, WAVE_COUNTDOWN, towerDmg, towerRange, towerRate, upgradeCost,
} from './config';
import { flags } from './flags';
import { SpatialGrid } from './grid';
import { PATH_LEN, TILE_KIND, inBounds, pointAt } from './map';
import { mulberry32 } from './rng';
import { buildWave, hpMul, rewardMul, waveBonus, type Spawn } from './waves';

export type Phase = 'menu' | 'playing' | 'victory' | 'gameover';

export const MAX_ENEMIES = 16384;
export const MAX_PARTICLES = 2500; // pooled mode only
export const STRESS_WAVE = 25; // constant stress mode: enemies use this wave's HP
export const STRESS_WAVE_SECONDS = 6; // 50-wave stress run: seconds per wave (50 waves ≈ 5 min)
const MAX_RADIUS = Math.max(...ENEMIES.map((e) => e.radius));

let nextId = 1;

export class Enemy {
  id = 0;
  kind = 0;
  x = 0;
  y = 0;
  px = 0; // position at the previous step (renderer interpolates px→x)
  py = 0;
  s = 0;
  hp = 0;
  maxHp = 0;
  speed = 0;
  armor = 0;
  slowUntil = 0;
  slowMul = 1;
  flash = 0;
  dead = false;

  init(kind: number, hpScale: number, s: number) {
    const d = ENEMIES[kind];
    this.id = nextId++;
    this.kind = kind;
    this.hp = this.maxHp = d.hp * hpScale;
    this.speed = d.speed;
    this.armor = d.armor;
    this.s = s;
    this.slowUntil = 0;
    this.slowMul = 1;
    this.flash = 0;
    this.dead = false;
    pointAt(s, this);
    this.px = this.x;
    this.py = this.y;
    return this;
  }
}

export class Tower {
  level = 0;
  cooldown = 0;
  angle = 0;
  target: Enemy | null = null;
  targetId = 0;
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
  kind = 0;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  dmg = 0;
  ttl = 0;
  tx = 0; // shell target point
  ty = 0;
  splash = 0;
  owner: Tower | null = null;

  init(kind: number, x: number, y: number, vx: number, vy: number, dmg: number, ttl: number, tx: number, ty: number, splash: number, owner: Tower | null) {
    this.kind = kind;
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.dmg = dmg;
    this.ttl = ttl;
    this.tx = tx;
    this.ty = ty;
    this.splash = splash;
    this.owner = owner;
    return this;
  }
}

export const P_DOT = 0, P_RING = 1, P_TEXT = 2, P_LINE = 3;

export class Particle {
  kind = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 0;
  color = '';
  size = 0;
  text = '';
  x2 = 0;
  y2 = 0;

  init(kind: number, x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, text = '', x2 = 0, y2 = 0) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = this.maxLife = life;
    this.color = color;
    this.size = size;
    this.text = text;
    this.x2 = x2;
    this.y2 = y2;
    return this;
  }
}

export interface StressConfig {
  enemies: number;
  towers: number;
  projectiles: number;
  // 50-wave stress run: counts are held constant while waves 1..50 advance on a timer, enemies are mortal
  // (killed ones are replaced from the current wave's mix and HP), so the pools churn the whole time.
  waves?: boolean;
}

// Gameplay events for sound/feedback. Plain counters per tick, so the sim never calls out mid-step.
export const EV_SHOT_GUN = 0, EV_SHOT_CANNON = 1, EV_SHOT_SNIPER = 2, EV_FROST = 3, EV_EXPLODE = 4, EV_HIT = 5,
  EV_KILL = 6, EV_BOSS_KILL = 7, EV_LIFE_LOST = 8, EV_WAVE = 9, EV_BOSS_SPAWN = 10, EV_BUILD = 11, EV_UPGRADE = 12, EV_SELL = 13;
export const EV_COUNT = 14;

const tmp = { x: 0, y: 0 };

export class Game {
  phase: Phase = 'menu';
  gold = START_GOLD;
  lives = START_LIVES;
  score = 0;
  wave = 0; // waves started so far
  time = 0;
  kills = 0;
  events = new Uint16Array(EV_COUNT);

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  occupied: (Tower | null)[] = new Array(COLS * ROWS).fill(null);

  // pools (used when flags.usePool)
  private enemyPool: Enemy[] = [];
  private projPool: Projectile[] = [];
  private particlePool: Particle[] = [];
  private deadCount = 0;

  // spatial index (used when flags.useGrid)
  private grid = new SpatialGrid<Enemy>(MAX_ENEMIES);
  private cand: (Enemy | null)[] = new Array(MAX_ENEMIES).fill(null);

  spawnQueue: Spawn[] = [];
  spawnIdx = 0;
  waveTime = 0;
  waveActive = false;
  countdown = -1; // seconds until next wave; -1 = waiting for the player
  bannerTime = 0;
  baseHit = 0;

  stress: StressConfig | null = null;
  stressTime = 0; // 50-wave stress run clock
  private stressMix: number[] = [];
  private stressMixIdx = 0;
  rng = mulberry32(42);

  reset() {
    this.phase = 'menu';
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.score = 0;
    this.wave = 0;
    this.time = 0;
    this.kills = 0;
    this.events.fill(0);
    for (const e of this.enemies) this.enemyPool.push(e);
    for (const p of this.projectiles) this.projPool.push(p);
    for (const p of this.particles) this.particlePool.push(p);
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.particles.length = 0;
    this.towers = [];
    this.deadCount = 0;
    this.occupied = new Array(COLS * ROWS).fill(null);
    this.spawnQueue = [];
    this.spawnIdx = 0;
    this.waveTime = 0;
    this.waveActive = false;
    this.countdown = -1;
    this.bannerTime = 0;
    this.baseHit = 0;
    this.stress = null;
    this.stressTime = 0;
    this.stressMixIdx = 0;
    this.rng = mulberry32(42);
  }

  start() {
    this.reset();
    this.phase = 'playing';
  }

  // ---------- allocation helpers ----------

  private newEnemy() {
    return (flags.usePool && this.enemyPool.pop()) || new Enemy();
  }

  private newProjectile() {
    return (flags.usePool && this.projPool.pop()) || new Projectile();
  }

  private addParticle(kind: number, x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, text = '', x2 = 0, y2 = 0) {
    if (flags.usePool && this.particles.length >= MAX_PARTICLES) return;
    const p = (flags.usePool && this.particlePool.pop()) || new Particle();
    this.particles.push(p.init(kind, x, y, vx, vy, life, color, size, text, x2, y2));
  }

  // Remove index i: O(1) swap-remove into the pool, or the naive order-preserving splice
  private removeProjectile(i: number) {
    const arr = this.projectiles;
    if (flags.usePool) {
      const p = arr[i];
      p.owner = null;
      arr[i] = arr[arr.length - 1];
      arr.pop();
      this.projPool.push(p);
    } else {
      arr.splice(i, 1);
    }
  }

  private removeParticle(i: number) {
    const arr = this.particles;
    if (flags.usePool) {
      const p = arr[i];
      arr[i] = arr[arr.length - 1];
      arr.pop();
      this.particlePool.push(p);
    } else {
      arr.splice(i, 1);
    }
  }

  private removeEnemyAt(i: number) {
    const arr = this.enemies;
    const e = arr[i];
    e.dead = true;
    if (flags.usePool) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
      this.enemyPool.push(e);
    } else {
      arr.splice(i, 1);
    }
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
    this.events[EV_WAVE]++;
  }

  spawnEnemy(kind: number, scale: number, s = 0) {
    const e = this.newEnemy().init(kind, scale, s);
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
    if (!this.stress) {
      this.burst(t.x, t.y, TOWERS[kind].color, 10, 80);
      this.events[EV_BUILD]++;
    }
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
    this.events[EV_UPGRADE]++;
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
    this.events[EV_SELL]++;
  }

  // ---------- simulation ----------

  update(dt: number) {
    if (this.phase !== 'playing') return;
    this.time += dt;
    if (this.bannerTime > 0) this.bannerTime -= dt;
    if (this.baseHit > 0) this.baseHit -= dt;

    if (!this.stress) this.updateWaves(dt);
    else if (this.stress.waves) this.updateStressWaves(dt);
    this.updateEnemies(dt);
    if (flags.useGrid) this.grid.rebuild(this.enemies);
    for (let i = 0; i < this.towers.length; i++) this.updateTower(this.towers[i], dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.sweepDead();
    if (this.stress) {
      if (this.stress.waves) this.topUpEnemies();
      this.topUpProjectiles();
    }

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
        if (kind === 4) this.events[EV_BOSS_SPAWN]++;
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
      e.px = e.x;
      e.py = e.y;
      e.s += e.speed * mul * dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.s >= PATH_LEN) {
        if (this.stress) {
          e.s -= PATH_LEN;
          pointAt(e.s, e);
          e.px = e.x; // teleport back to the start: don't interpolate across the map
          e.py = e.y;
          continue;
        } else {
          this.lives -= ENEMIES[e.kind].lives;
          this.baseHit = 0.3;
          this.events[EV_LIFE_LOST]++;
          this.removeEnemyAt(i);
          continue;
        }
      }
      pointAt(e.s, e);
    }
  }

  // Enemies killed mid-tick are only flagged in pooled mode; remove them here in one O(n) pass
  private sweepDead() {
    if (this.deadCount === 0) return;
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) this.removeEnemyAt(i);
    this.deadCount = 0;
  }

  // Candidates near (x, y): grid cells overlapping the circle, or every enemy (naive).
  // Results are read from this.src[0..n).
  private src: (Enemy | null)[] = this.cand;
  private candidates(x: number, y: number, r: number): number {
    if (flags.useGrid) {
      this.src = this.cand;
      return this.grid.query(x, y, r, this.cand);
    }
    this.src = this.enemies;
    return this.enemies.length;
  }

  private findTarget(t: Tower, r2: number): Enemy | null {
    let best: Enemy | null = null;
    if (flags.useGrid) {
      const n = this.grid.query(t.x, t.y, Math.sqrt(r2), this.cand);
      for (let i = 0; i < n; i++) {
        const e = this.cand[i]!;
        if (e.dead) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= r2 && (!best || e.s > best.s)) best = e;
      }
    } else {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= r2 && (!best || e.s > best.s)) best = e;
      }
    }
    return best;
  }

  private updateTower(t: Tower, dt: number) {
    t.cooldown -= dt;
    const range = t.range;
    const r2 = range * range;

    let best: Enemy | null;
    if (flags.useTargetCache) {
      // Keep the current target while it's alive and in range; only search when ready to fire
      best = t.target;
      if (best) {
        const dx = best.x - t.x, dy = best.y - t.y;
        if (best.dead || best.id !== t.targetId || dx * dx + dy * dy > r2) best = null;
      }
      if (!best && t.cooldown <= 0) best = this.findTarget(t, r2);
    } else {
      best = this.findTarget(t, r2);
    }
    t.target = best;
    if (!best) return;
    t.targetId = best.id;
    t.angle = Math.atan2(best.y - t.y, best.x - t.x);
    if (t.cooldown > 0) return;

    const def = TOWERS[t.kind];
    if (t.kind === FROST) {
      t.cooldown = 1 / t.rate;
      const dmg = t.dmg;
      const n = this.candidates(t.x, t.y, range);
      const src = this.src;
      for (let i = n - 1; i >= 0; i--) {
        const e = src[i];
        if (!e) continue;
        if (e.dead) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy <= r2) {
          e.slowUntil = this.time + def.slowDur;
          e.slowMul = 1 - def.slow * ENEMIES[e.kind].slowResist;
          this.damage(e, dmg, false, t);
        }
      }
      this.addParticle(P_RING, t.x, t.y, 0, 0, 0.4, def.color, range);
      this.events[EV_FROST]++;
      return;
    }

    if (this.stress && this.projectiles.length >= this.stress.projectiles && t.kind !== SNIPER) return;
    t.cooldown = 1 / t.rate;

    if (t.kind === SNIPER) {
      this.addParticle(P_LINE, t.x, t.y, 0, 0, 0.15, def.color, 2, '', best.x, best.y);
      this.damage(best, t.dmg, true, t);
      this.events[EV_SHOT_SNIPER]++;
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
      this.projectiles.push(this.newProjectile().init(BULLET, t.x, t.y, vx, vy, t.dmg, (range * 1.3) / def.projSpeed, 0, 0, 0, t));
      this.events[EV_SHOT_GUN]++;
    } else if (t.kind === CANNON) {
      this.projectiles.push(this.newProjectile().init(SHELL, t.x, t.y, vx, vy, t.dmg, al / def.projSpeed, tmp.x, tmp.y, def.splash, t));
      this.events[EV_SHOT_CANNON]++;
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;

      if (p.kind === SHELL) {
        if (p.ttl <= 0) {
          this.explode(p);
          this.removeProjectile(i);
        }
        continue;
      }

      // Bullet: first enemy it overlaps
      let hit: Enemy | null = null;
      const n = this.candidates(p.x, p.y, MAX_RADIUS + 3);
      const src = this.src;
      for (let k = 0; k < n; k++) {
        const e = src[k]!;
        if (e.dead) continue;
        const r = ENEMIES[e.kind].radius + 3;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy <= r * r) {
          hit = e;
          break;
        }
      }
      if (hit) {
        this.damage(hit, p.dmg, false, p.owner);
        this.addParticle(P_DOT, p.x, p.y, 0, 0, 0.15, '#fff7c2', 3);
        this.events[EV_HIT]++;
        this.removeProjectile(i);
      } else if (p.ttl <= 0) {
        this.removeProjectile(i);
      }
    }
  }

  private explode(p: Projectile) {
    const r2 = p.splash * p.splash;
    const n = this.candidates(p.tx, p.ty, p.splash);
    const src = this.src;
    for (let i = n - 1; i >= 0; i--) {
      const e = src[i];
      if (!e) continue;
      if (e.dead) continue;
      const dx = e.x - p.tx, dy = e.y - p.ty;
      if (dx * dx + dy * dy <= r2) this.damage(e, p.dmg, false, p.owner);
    }
    this.addParticle(P_RING, p.tx, p.ty, 0, 0, 0.3, '#fb923c', p.splash);
    this.burst(p.tx, p.ty, '#fdba74', 8, 140);
    this.events[EV_EXPLODE]++;
  }

  damage(e: Enemy, dmg: number, pierce: boolean, by: Tower | null) {
    if (e.hp <= 0 || e.dead) return;
    e.hp -= pierce ? dmg : Math.max(1, dmg - e.armor);
    e.flash = 0.08;
    if (e.hp > 0) return;
    if (this.stress && !this.stress.waves) {
      e.hp = e.maxHp; // constant stress mode: enemies are immortal so the count holds
      return;
    }
    const d = ENEMIES[e.kind];
    const reward = Math.max(1, Math.round(d.reward * rewardMul(this.wave)));
    this.gold += reward;
    this.score += d.reward * 10;
    this.kills++;
    this.events[e.kind === 4 ? EV_BOSS_KILL : EV_KILL]++;
    if (by) by.kills++;
    this.burst(e.x, e.y, d.color, 6, 90);
    this.floatText(e.x, e.y - 8, '+' + reward, '#f5c542');
    if (flags.usePool) {
      e.dead = true; // removed in sweepDead() at the end of the tick
      this.deadCount++;
    } else {
      this.removeEnemyAt(this.enemies.indexOf(e));
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.removeParticle(i);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.addParticle(P_DOT, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45, color, 2.5);
    }
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.addParticle(P_TEXT, x, y, 0, -30, 0.9, color, 12, text);
  }

  // ---------- stress mode ----------

  startStress(cfg: StressConfig) {
    this.reset();
    this.phase = 'playing';
    this.stress = { ...cfg };
    this.gold = 0;
    this.lives = 999;
    if (cfg.waves) this.setStressWave(1);
    this.setStress(cfg);
  }

  private setStressWave(n: number) {
    this.wave = n;
    this.stressMix = buildWave(n).map((sp) => sp.kind);
    this.stressMixIdx = 0;
    this.bannerTime = 2.5;
    this.events[EV_WAVE]++;
  }

  private spawnStressEnemy() {
    const st = this.stress!;
    if (st.waves) {
      const kind = this.stressMix[this.stressMixIdx++ % this.stressMix.length];
      this.spawnEnemy(kind, hpMul(this.wave), this.rng() * PATH_LEN);
    } else {
      this.spawnEnemy(this.enemies.length % 4, hpMul(STRESS_WAVE), this.rng() * PATH_LEN);
    }
  }

  private updateStressWaves(dt: number) {
    this.stressTime += dt;
    if (this.stressTime >= WAVE_COUNT * STRESS_WAVE_SECONDS) {
      this.phase = 'victory'; // run complete
      return;
    }
    const w = 1 + Math.floor(this.stressTime / STRESS_WAVE_SECONDS);
    if (w !== this.wave) this.setStressWave(w);
  }

  // Replace enemies killed this tick so the count stays at the target
  private topUpEnemies() {
    const want = Math.min(this.stress!.enemies, MAX_ENEMIES);
    while (this.enemies.length < want) this.spawnStressEnemy();
  }

  // Adjust live counts to match the config (sliders call this)
  setStress(cfg: StressConfig) {
    if (!this.stress) return;
    this.stress = { ...cfg, waves: cfg.waves ?? this.stress.waves };
    while (this.enemies.length > cfg.enemies) this.removeEnemyAt(this.enemies.length - 1);
    while (this.enemies.length < cfg.enemies && this.enemies.length < MAX_ENEMIES) this.spawnStressEnemy();
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
    while (this.projectiles.length > cfg.projectiles) this.removeProjectile(this.projectiles.length - 1);
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
      this.projectiles.push(this.newProjectile().init(BULLET, x, y, ((tx - x) / d) * 650, ((ty - y) / d) * 650, 8, d / 650 + 0.05, 0, 0, 0, t));
    }
  }
}
