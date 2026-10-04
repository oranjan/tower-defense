// Renderer. Each optimisation is behind a flag (flags.ts); the naive* methods are the v0 code paths.
//   useBgCache  → static map lives on #bg and is redrawn only when the camera moves
//   useSprites  → one drawImage per entity from a pre-rendered atlas; HP bars in two batched paths
//   useCulling  → entities outside the visible world rect are skipped
import type { Camera } from './camera';
import { COLS, ENEMIES, MAX_LEVEL, ROWS, SHIELDED, TILE, TOWERS, WORLD_H, WORLD_W } from './config';
import { flags } from './flags';
import { type Game, P_DOT, P_LINE, P_RING, P_TEXT, SHELL, type Particle, type Tower } from './game';
import { BASE_COL, BASE_ROW, PATH, TILE_KIND } from './map';
import { ATLAS, VAR_FLASH, VAR_NORMAL, VAR_SLOW, bulletSprite, enemySprites, shellSprite, towerSprites, type Sprite } from './sprites';

export interface Hover {
  col: number;
  row: number;
  buildKind: number; // -1 = not building
}

const CULL_MARGIN = 40; // world px: covers the largest sprite + glow

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bgCtx: CanvasRenderingContext2D;
  private bgDirty = true; // bg canvas content is stale
  private view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private off = { x: 0, y: 0 };
  drawn = 0; // entities drawn last frame (shown in the stats panel)

  constructor(private canvas: HTMLCanvasElement, private bg: HTMLCanvasElement, private cam: Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.bgCtx = bg.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, dpr: number) {
    for (const c of [this.canvas, this.bg]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.bgDirty = true;
  }

  render(g: Game, hover: Hover, selected: Tower | null) {
    const ctx = this.ctx;
    const cam = this.cam;
    cam.shake = g.baseHit > 0 ? g.baseHit : 0;
    cam.beginFrame();
    cam.visible(this.view);
    const v = this.view;
    v.x0 -= CULL_MARGIN;
    v.y0 -= CULL_MARGIN;
    v.x1 += CULL_MARGIN;
    v.y1 += CULL_MARGIN;
    this.drawn = 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const camMoved = cam.changedSince();
    if (flags.useBgCache) {
      // Map lives on its own canvas and is redrawn only when the camera changed
      if (camMoved || this.bgDirty) {
        const b = this.bgCtx;
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.fillStyle = '#0b0e13';
        b.fillRect(0, 0, this.bg.width, this.bg.height);
        cam.apply(b);
        this.naiveMap(b);
        this.bgDirty = false;
      }
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.bgDirty = true;
      ctx.fillStyle = '#0b0e13';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    cam.apply(ctx);
    if (!flags.useBgCache) this.naiveMap(ctx);
    if (hover.buildKind >= 0) this.gridLines(ctx);

    if (flags.useSprites) {
      this.fastTowers(ctx, g);
      this.fastEnemies(ctx, g);
      this.fastProjectiles(ctx, g);
      this.fastParticles(ctx, g);
    } else {
      this.naiveTowers(ctx, g);
      this.naiveEnemies(ctx, g);
      this.naiveProjectiles(ctx, g);
      this.naiveParticles(ctx, g);
    }

    if (selected) this.rangeCircle(ctx, selected.x, selected.y, selected.range, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.5)');
    if (hover.buildKind >= 0 && hover.col >= 0) this.drawGhost(ctx, g, hover);

    // Screen-space overlays
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    if (g.bannerTime > 0 && g.phase === 'playing') {
      const a = Math.min(1, g.bannerTime);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 12;
      ctx.fillText(`Wave ${g.wave}`, cam.viewW / 2, cam.viewH * 0.22);
      if (g.wave % 10 === 0) {
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillStyle = '#f43f5e';
        ctx.fillText('BOSS WAVE', cam.viewW / 2, cam.viewH * 0.22 + 32);
      }
      ctx.restore();
    }
  }

  private outside(x: number, y: number) {
    const v = this.view;
    return flags.useCulling && (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1);
  }

  // ---------- optimised paths ----------

  private blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
    ctx.drawImage(ATLAS, s.sx, s.sy, s.sw, s.sw, x - s.h, y - s.h, s.h * 2, s.h * 2);
  }

  private fastEnemies(ctx: CanvasRenderingContext2D, g: Game) {
    const list = g.enemies;
    const t = g.time;
    // bodies: one drawImage each, all from the same atlas image
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || this.outside(e.x, e.y)) continue;
      const variant = e.flash > 0 ? VAR_FLASH : t < e.slowUntil ? VAR_SLOW : VAR_NORMAL;
      this.blit(ctx, enemySprites[e.kind][variant], e.x, e.y);
      this.drawn++;
    }
    // HP bars: two batched paths (backgrounds, then fills); skipped when too small to read
    if (this.cam.scale < 0.5) return;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.hp >= e.maxHp || this.outside(e.x, e.y)) continue;
        const r = ENEMIES[e.kind].radius;
        ctx.rect(e.x - r, e.y - r - 7, pass === 0 ? r * 2 : (r * 2 * e.hp) / e.maxHp, 3);
      }
      ctx.fillStyle = pass === 0 ? '#7f1d1d' : '#22c55e';
      ctx.fill();
    }
  }

  private fastProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
    const list = g.projectiles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (this.outside(p.x, p.y)) continue;
      this.blit(ctx, p.kind === SHELL ? shellSprite : bulletSprite, p.x, p.y);
      this.drawn++;
    }
  }

  private fastTowers(ctx: CanvasRenderingContext2D, g: Game) {
    const towers = g.towers;
    for (const t of towers) {
      if (this.outside(t.x, t.y)) continue;
      this.blit(ctx, towerSprites[t.kind], t.x, t.y);
      this.drawn++;
    }
    // barrels: build each rotation with setTransform instead of save/translate/rotate/restore
    const k = this.cam.scale * this.cam.dpr;
    this.cam.deviceOffset(this.off);
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    for (const t of towers) {
      if (this.outside(t.x, t.y)) continue;
      const c = Math.cos(t.angle) * k, s = Math.sin(t.angle) * k;
      ctx.setTransform(c, s, -s, c, this.off.x + t.x * k, this.off.y + t.y * k);
      if (t.kind === 0) ctx.fillRect(0, -3, 22, 6);
      else if (t.kind === 1) ctx.fillRect(0, -6, 18, 12);
      else if (t.kind === 3) ctx.fillRect(0, -2, 30, 4);
      else {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = ((i + 1) * Math.PI) / 3;
          ctx.moveTo(-10 * Math.cos(a), -10 * Math.sin(a));
          ctx.lineTo(10 * Math.cos(a), 10 * Math.sin(a));
        }
        ctx.stroke();
      }
    }
    this.cam.apply(ctx);
    ctx.fillStyle = '#fde68a';
    ctx.strokeStyle = '#fde68a';
    for (const t of towers) {
      if (this.outside(t.x, t.y)) continue;
      for (let i = 0; i < t.level; i++) ctx.fillRect(t.x - 18 + i * 8, t.y + 16, 6, 4);
      if (t.level === MAX_LEVEL) ctx.strokeRect(t.x - 23, t.y - 23, 46, 46);
    }
  }

  private fastParticles(ctx: CanvasRenderingContext2D, g: Game) {
    const list = g.particles;
    let color = '';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.kind !== P_LINE && this.outside(p.x, p.y)) continue;
      ctx.globalAlpha = p.life / p.maxLife;
      if (p.kind === P_DOT) {
        if (p.color !== color) ctx.fillStyle = color = p.color;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        this.particleShape(ctx, p);
        color = '';
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- naive paths (v0) ----------

  private naiveMap(ctx: CanvasRenderingContext2D) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = TILE_KIND[r * COLS + c];
        if (k === 0) ctx.fillStyle = (r + c) % 2 ? '#2d4a2b' : '#30502e';
        else ctx.fillStyle = (r + c) % 2 ? '#8a7350' : '#917955';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 34;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.restore();

    const bx = BASE_COL * TILE, by = BASE_ROW * TILE;
    ctx.save();
    ctx.fillStyle = '#475569';
    ctx.fillRect(bx + 6, by + 14, TILE - 12, TILE - 18);
    ctx.fillStyle = '#64748b';
    for (let i = 0; i < 4; i++) ctx.fillRect(bx + 6 + i * 14, by + 6, 10, 10);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(bx + TILE / 2 - 1, by - 14, 2, 22);
    ctx.fillRect(bx + TILE / 2 + 1, by - 14, 14, 9);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(244,63,94,0.5)';
    ctx.beginPath();
    const sy = PATH[1].y;
    ctx.moveTo(4, sy - 14);
    ctx.lineTo(24, sy);
    ctx.lineTo(4, sy + 14);
    ctx.fill();
    ctx.restore();
  }

  private gridLines(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) {
      ctx.moveTo(c * TILE, 0);
      ctx.lineTo(c * TILE, WORLD_H);
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.moveTo(0, r * TILE);
      ctx.lineTo(WORLD_W, r * TILE);
    }
    ctx.stroke();
  }

  private naiveTowers(ctx: CanvasRenderingContext2D, g: Game) {
    for (const t of g.towers) {
      if (this.outside(t.x, t.y)) continue;
      this.drawn++;
      const def = TOWERS[t.kind];
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-24, -24, 48, 48);
      ctx.fillStyle = '#374151';
      ctx.fillRect(-20, -20, 40, 40);
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.rotate(t.angle);
      ctx.fillStyle = '#e5e7eb';
      if (t.kind === 0) ctx.fillRect(0, -3, 22, 6);
      else if (t.kind === 1) ctx.fillRect(0, -6, 18, 12);
      else if (t.kind === 3) ctx.fillRect(0, -2, 30, 4);
      else {
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#fde68a';
      for (let i = 0; i < t.level; i++) ctx.fillRect(t.x - 18 + i * 8, t.y + 16, 6, 4);
      if (t.level === MAX_LEVEL) {
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x - 23, t.y - 23, 46, 46);
      }
      ctx.restore();
    }
  }

  private naiveEnemies(ctx: CanvasRenderingContext2D, g: Game) {
    for (const e of g.enemies) {
      if (e.dead || this.outside(e.x, e.y)) continue;
      this.drawn++;
      const d = ENEMIES[e.kind];
      ctx.save();
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : d.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (e.kind === SHIELDED || e.armor > 0) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (g.time < e.slowUntil) {
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, d.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0e13';
      ctx.font = `bold ${Math.round(d.radius)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name[0], e.x, e.y + 1);
      if (e.hp < e.maxHp) {
        const w = d.radius * 2;
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(e.x - w / 2, e.y - d.radius - 7, w, 3);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(e.x - w / 2, e.y - d.radius - 7, (w * e.hp) / e.maxHp, 3);
      }
      ctx.restore();
    }
  }

  private naiveProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
    for (const p of g.projectiles) {
      if (this.outside(p.x, p.y)) continue;
      this.drawn++;
      ctx.save();
      ctx.shadowBlur = 6;
      if (p.kind === SHELL) {
        ctx.shadowColor = '#f97316';
        ctx.fillStyle = '#292524';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      } else {
        ctx.shadowColor = '#fde68a';
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  private naiveParticles(ctx: CanvasRenderingContext2D, g: Game) {
    for (const p of g.particles) {
      if (p.kind !== P_LINE && this.outside(p.x, p.y)) continue;
      ctx.save();
      ctx.globalAlpha = p.life / p.maxLife;
      if (p.kind === P_DOT) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.particleShape(ctx, p);
      }
      ctx.restore();
    }
  }

  // Rings, sniper tracers and floating text (few per frame in both paths)
  private particleShape(ctx: CanvasRenderingContext2D, p: Particle) {
    const a = p.life / p.maxLife;
    if (p.kind === P_RING) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - a * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === P_LINE) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
    } else if (p.kind === P_TEXT) {
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
  }

  private rangeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, g: Game, h: Hover) {
    const ok = g.canPlace(h.buildKind, h.col, h.row);
    const x = (h.col + 0.5) * TILE, y = (h.row + 0.5) * TILE;
    const def = TOWERS[h.buildKind];
    this.rangeCircle(ctx, x, y, def.range, ok ? 'rgba(255,255,255,0.07)' : 'rgba(239,68,68,0.08)', ok ? 'rgba(255,255,255,0.4)' : 'rgba(239,68,68,0.6)');
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = ok ? def.color : '#ef4444';
    ctx.fillRect(x - 20, y - 20, 40, 40);
    ctx.restore();
  }
}
