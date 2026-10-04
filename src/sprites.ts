// Pre-rendered sprite atlas. Every enemy look (normal / slowed / hit-flash), projectile and tower base is
// drawn ONCE at startup, glow included. A frame then draws each entity with a single drawImage from one
// source image, which Canvas 2D can batch on the GPU.
import { ENEMIES, SHIELDED, TOWERS } from './config';

const RES = 4; // atlas pixels per world pixel (keeps sprites sharp up to ~4x zoom)
const CELL = 64; // world px per atlas cell

export interface Sprite {
  sx: number;
  sy: number;
  sw: number; // source size in atlas px
  h: number; // half size in world px
}

export const VAR_NORMAL = 0, VAR_SLOW = 1, VAR_FLASH = 2;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

class Atlas {
  canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private n = 0;
  private cols = 8;

  constructor(cells: number) {
    this.canvas.width = this.cols * CELL * RES;
    this.canvas.height = Math.ceil(cells / this.cols) * CELL * RES;
    this.ctx = this.canvas.getContext('2d')!;
  }

  add(h: number, draw: (ctx: CanvasRenderingContext2D) => void): Sprite {
    const col = this.n % this.cols, row = Math.floor(this.n / this.cols);
    this.n++;
    const sx = col * CELL * RES, sy = row * CELL * RES;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(RES, RES);
    ctx.translate(h, h); // origin = sprite centre
    draw(ctx);
    ctx.restore();
    return { sx, sy, sw: h * 2 * RES, h };
  }
}

const atlas = new Atlas(ENEMIES.length * 3 + 2 + TOWERS.length);

export const ATLAS = atlas.canvas;

// enemySprites[kind][variant]
export const enemySprites: Sprite[][] = ENEMIES.map((d, kind) =>
  [VAR_NORMAL, VAR_SLOW, VAR_FLASH].map((v) =>
    atlas.add(d.radius + 8, (ctx) => {
      ctx.shadowColor = d.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = v === VAR_FLASH ? '#ffffff' : d.color;
      circle(ctx, 0, 0, d.radius);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (kind === SHIELDED || d.armor > 0) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (v === VAR_SLOW) {
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 2;
        circle(ctx, 0, 0, d.radius + 3);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0e13';
      ctx.font = `bold ${Math.round(d.radius)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name[0], 0, 1);
    }),
  ),
);

export const bulletSprite = atlas.add(7, (ctx) => {
  ctx.shadowColor = '#fde68a';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#fef3c7';
  circle(ctx, 0, 0, 3);
  ctx.fill();
});

export const shellSprite = atlas.add(11, (ctx) => {
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#292524';
  circle(ctx, 0, 0, 6);
  ctx.fill();
});

export const towerSprites: Sprite[] = TOWERS.map((def) =>
  atlas.add(30, (ctx) => {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-24, -24, 48, 48);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-20, -20, 40, 40);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = def.color;
    circle(ctx, 0, 0, 13);
    ctx.fill();
  }),
);
