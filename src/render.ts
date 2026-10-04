// NAIVE renderer — the "obvious" approach on purpose:
//  - one canvas; the whole map is redrawn from scratch every frame
//  - every enemy/projectile gets save/restore, its own path, shadowBlur glow and fillText
//  - every entity is drawn, visible or not
import type { Camera } from './camera';
import { COLS, ENEMIES, MAX_LEVEL, ROWS, SHIELDED, TILE, TOWERS, WORLD_H, WORLD_W } from './config';
import { type Game, P_DOT, P_LINE, P_RING, P_TEXT, SHELL } from './game';
import { BASE_COL, BASE_ROW, PATH, TILE_KIND } from './map';

export interface Hover {
  col: number;
  row: number;
  buildKind: number; // -1 = not building
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, private cam: Camera) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  render(g: Game, hover: Hover, selected: Game['towers'][number] | null) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.cam.shake = g.baseHit > 0 ? g.baseHit : 0;
    this.cam.apply(ctx);

    this.drawMap(ctx, hover.buildKind >= 0);
    this.drawTowers(ctx, g);
    this.drawEnemies(ctx, g);
    this.drawProjectiles(ctx, g);
    this.drawParticles(ctx, g);

    if (selected) this.rangeCircle(ctx, selected.x, selected.y, selected.range, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.5)');
    if (hover.buildKind >= 0 && hover.col >= 0) this.drawGhost(ctx, g, hover);

    // Screen-space overlays
    ctx.setTransform(this.cam.dpr, 0, 0, this.cam.dpr, 0, 0);
    if (g.bannerTime > 0 && g.phase === 'playing') {
      const a = Math.min(1, g.bannerTime);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 12;
      ctx.fillText(`Wave ${g.wave}`, this.cam.viewW / 2, this.cam.viewH * 0.22);
      if (g.wave % 10 === 0) {
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillStyle = '#f43f5e';
        ctx.fillText('BOSS WAVE', this.cam.viewW / 2, this.cam.viewH * 0.22 + 32);
      }
      ctx.restore();
    }
  }

  private drawMap(ctx: CanvasRenderingContext2D, grid: boolean) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = TILE_KIND[r * COLS + c];
        if (k === 0) ctx.fillStyle = (r + c) % 2 ? '#2d4a2b' : '#30502e';
        else ctx.fillStyle = (r + c) % 2 ? '#8a7350' : '#917955';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    // path centre line
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 34;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.restore();

    if (grid) {
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

    // base
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

    // spawn marker
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

  private drawTowers(ctx: CanvasRenderingContext2D, g: Game) {
    for (const t of g.towers) {
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

  private drawEnemies(ctx: CanvasRenderingContext2D, g: Game) {
    for (const e of g.enemies) {
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

  private drawProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
    for (const p of g.projectiles) {
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

  private drawParticles(ctx: CanvasRenderingContext2D, g: Game) {
    for (const p of g.particles) {
      const a = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === P_DOT) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === P_RING) {
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
      ctx.restore();
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
