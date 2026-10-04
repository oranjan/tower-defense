import { WORLD_H, WORLD_W } from './config';

// Pan/zoom over the world. zoom = 1 fits the whole map in the view.
export class Camera {
  zoom = 1;
  cx = WORLD_W / 2;
  cy = WORLD_H / 2;
  viewW = 1;
  viewH = 1;
  dpr = 1;
  shake = 0;

  get scale() {
    return Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H) * this.zoom;
  }

  resize(w: number, h: number, dpr: number) {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.clamp();
  }

  apply(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    const d = this.dpr;
    let ox = this.viewW / 2 - this.cx * s;
    let oy = this.viewH / 2 - this.cy * s;
    if (this.shake > 0) {
      ox += (Math.random() - 0.5) * this.shake * 12;
      oy += (Math.random() - 0.5) * this.shake * 12;
    }
    ctx.setTransform(s * d, 0, 0, s * d, ox * d, oy * d);
  }

  screenToWorld(sx: number, sy: number, out: { x: number; y: number }) {
    const s = this.scale;
    out.x = (sx - this.viewW / 2) / s + this.cx;
    out.y = (sy - this.viewH / 2) / s + this.cy;
  }

  // Visible world rectangle
  visible(out: { x0: number; y0: number; x1: number; y1: number }) {
    const s = this.scale;
    const hw = this.viewW / 2 / s, hh = this.viewH / 2 / s;
    out.x0 = this.cx - hw;
    out.y0 = this.cy - hh;
    out.x1 = this.cx + hw;
    out.y1 = this.cy + hh;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = { x: 0, y: 0 }, after = { x: 0, y: 0 };
    this.screenToWorld(sx, sy, before);
    this.zoom = Math.min(4, Math.max(1, this.zoom * factor));
    this.screenToWorld(sx, sy, after);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clamp();
  }

  pan(dxScreen: number, dyScreen: number) {
    const s = this.scale;
    this.cx -= dxScreen / s;
    this.cy -= dyScreen / s;
    this.clamp();
  }

  clamp() {
    const s = this.scale;
    const hw = this.viewW / 2 / s, hh = this.viewH / 2 / s;
    this.cx = hw * 2 >= WORLD_W ? WORLD_W / 2 : Math.min(WORLD_W - hw, Math.max(hw, this.cx));
    this.cy = hh * 2 >= WORLD_H ? WORLD_H / 2 : Math.min(WORLD_H - hh, Math.max(hh, this.cy));
  }
}
