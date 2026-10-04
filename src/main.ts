import { Stats, type StatsSummary } from './bench/stats';
import { Camera } from './camera';
import { TILE, TOWERS } from './config';
import { flagSummary, flags, flagsFromUrl } from './flags';
import { Game, type StressConfig } from './game';
import { Loop } from './loop';
import { Renderer, type Hover } from './render';
import { UI, type Controls } from './ui';
import './style.css';

const BUILD = 'v1';
const params = new URLSearchParams(location.search);
flagsFromUrl(params);

const stage = document.getElementById('stage')!;
const fg = document.getElementById('fg') as HTMLCanvasElement;
const bg = document.getElementById('bg') as HTMLCanvasElement;
const statsEl = document.getElementById('stats')!;

const game = new Game();
const cam = new Camera();
const renderer = new Renderer(fg, bg, cam);
const stats = new Stats();
const hover: Hover = { col: -1, row: -1, buildKind: -1 };

const controls: Controls = {
  buildKind: -1,
  selected: null,
  restart() {
    game.start();
    clearSelection();
    loop.paused = false;
    stats.reset();
  },
  toMenu() {
    game.reset();
    clearSelection();
    loop.paused = false;
  },
  startStress(cfg: StressConfig) {
    game.startStress(cfg);
    clearSelection();
    loop.paused = false;
    loop.speed = 1; // benchmarks always run at 1x
    stats.reset();
  },
  setStress(cfg: StressConfig) {
    game.setStress(cfg);
    stats.reset();
  },
  flagsChanged() {
    stats.reset();
  },
};

function clearSelection() {
  controls.buildKind = -1;
  controls.selected = null;
}

const loop = new Loop(
  {
    update: (dt) => game.update(dt),
    render: (alpha) => {
      panByKeys();
      hover.buildKind = controls.buildKind;
      if (controls.selected && !game.towers.includes(controls.selected)) controls.selected = null;
      renderer.render(game, hover, controls.selected, alpha);
      ui.update();
      updateStatsPanel();
    },
  },
  stats,
);
const ui = new UI(game, loop, controls);

// ---------- stats panel (4 Hz) ----------

const summary: StatsSummary = { fps: 0, p95: 0, p99: 0, pctOver33: 0, pctAt45: 0, simMs: 0, renderMs: 0, heapMb: -1 };
let lastStats = 0;
function updateStatsPanel() {
  const now = performance.now();
  if (now - lastStats < 250) return;
  lastStats = now;
  stats.summary(summary);
  const s = summary;
  statsEl.textContent =
    `${BUILD} [${flagSummary()}]\n` +
    `FPS now    ${stats.currentFps().toFixed(0)}\n` +
    `FPS avg    ${s.fps.toFixed(1)}  (10 s)\n` +
    `p95 frame  ${s.p95.toFixed(1)} ms\n` +
    `≥45 FPS    ${s.pctAt45.toFixed(1)} %\n` +
    `>33 ms     ${s.pctOver33.toFixed(1)} %\n` +
    `sim        ${s.simMs.toFixed(2)} ms\n` +
    `render     ${s.renderMs.toFixed(2)} ms\n` +
    `heap       ${s.heapMb < 0 ? 'n/a' : s.heapMb.toFixed(1) + ' MB'}\n` +
    `E/T/P      ${game.enemies.length}/${game.towers.length}/${game.projectiles.length}\n` +
    `particles  ${game.particles.length}\n` +
    `drawn      ${renderer.drawn}`;
}

function markdownRow() {
  stats.summary(summary);
  const s = summary;
  return `| ${BUILD} [${flagSummary()}] | ${game.enemies.length}/${game.towers.length}/${game.projectiles.length} | ${s.fps.toFixed(1)} | ${s.p95.toFixed(1)} | ${s.pctAt45.toFixed(1)} | ${s.pctOver33.toFixed(1)} | ${s.simMs.toFixed(2)} | ${s.renderMs.toFixed(2)} | ${s.heapMb < 0 ? 'n/a' : s.heapMb.toFixed(0)} |`;
}

const copyBtn = document.createElement('button');
copyBtn.className = 'wide';
copyBtn.textContent = 'Copy stats row (markdown)';
copyBtn.onclick = () => {
  const row = markdownRow();
  navigator.clipboard?.writeText(row).catch(() => {});
  console.log(row);
  copyBtn.textContent = 'Copied ✓';
  setTimeout(() => (copyBtn.textContent = 'Copy stats row (markdown)'), 1200);
};
document.querySelector('.stress')!.appendChild(copyBtn);

// ---------- sizing ----------

function resize() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cam.resize(r.width, r.height, dpr);
  renderer.resize(r.width, r.height, dpr);
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- input ----------

const world = { x: 0, y: 0 };
let down: { x: number; y: number; button: number } | null = null;
let dragging = false;

function updateHover(e: PointerEvent) {
  const r = fg.getBoundingClientRect();
  cam.screenToWorld(e.clientX - r.left, e.clientY - r.top, world);
  hover.col = Math.floor(world.x / TILE);
  hover.row = Math.floor(world.y / TILE);
}

fg.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, button: e.button };
  dragging = false;
  fg.setPointerCapture(e.pointerId);
});

fg.addEventListener('pointermove', (e) => {
  updateHover(e);
  if (!down) return;
  if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) dragging = true;
  if (dragging) {
    cam.pan(e.movementX, e.movementY);
  }
});

fg.addEventListener('pointerup', (e) => {
  updateHover(e);
  const wasDrag = dragging;
  const button = down?.button ?? 0;
  down = null;
  dragging = false;
  if (wasDrag || game.phase !== 'playing') return;
  if (button === 2) {
    clearSelection();
    return;
  }
  const t = game.towerAt(hover.col, hover.row);
  if (controls.buildKind >= 0 && !t) {
    game.place(controls.buildKind, hover.col, hover.row);
    if (!game.stress && game.gold < TOWERS[controls.buildKind].cost) controls.buildKind = -1;
  } else {
    controls.buildKind = -1;
    controls.selected = t;
  }
});

fg.addEventListener('pointerleave', () => {
  hover.col = hover.row = -1;
});
fg.addEventListener('contextmenu', (e) => e.preventDefault());
fg.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = fg.getBoundingClientRect();
    cam.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);

const held = new Set<string>();
let lastPan = performance.now();
function panByKeys() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastPan) / 1000);
  lastPan = now;
  const v = 700 * dt;
  let dx = 0, dy = 0;
  if (held.has('a') || held.has('arrowleft')) dx += v;
  if (held.has('d') || held.has('arrowright')) dx -= v;
  if (held.has('w') || held.has('arrowup')) dy += v;
  if (held.has('s') || held.has('arrowdown')) dy -= v;
  if (dx || dy) cam.pan(dx, dy);
}

window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  held.add(k);
  if (k === ' ') {
    e.preventDefault();
    ui.togglePause();
  } else if (k >= '1' && k <= '4') {
    const kind = +k - 1;
    controls.buildKind = controls.buildKind === kind ? -1 : kind;
    controls.selected = null;
  } else if (k === 'escape') {
    clearSelection();
  } else if (k === 'r') {
    controls.restart();
  } else if (k === 'n' || k === 'enter') {
    game.callNextWave();
  } else if (k === 'u' && controls.selected) {
    game.upgrade(controls.selected);
  } else if ((k === 'x' || k === 'delete' || k === 'backspace') && controls.selected) {
    game.sell(controls.selected);
    controls.selected = null;
  } else if (k === '+' || k === '=') {
    loop.speed = Math.min(4, loop.speed * 2);
  } else if (k === '-' || k === '_') {
    loop.speed = Math.max(1, loop.speed / 2);
  } else if (k === '0') {
    cam.zoom = 1;
    cam.clamp();
  }
});

// ---------- boot ----------

const stressParam = params.get('stress');
if (stressParam) {
  const [e, t, p] = stressParam.split(',').map(Number);
  const cfg = { enemies: e || 0, towers: t || 0, projectiles: p || 0, waves: params.get('waves') === '1' };
  ui.setStressInputs(cfg);
  controls.startStress(cfg);
}

// Exposed for debugging and scripts/bench.mjs
Object.assign(window, { game, statsRow: markdownRow, resetStats: () => stats.reset(), flags, cam, ui, Game, Loop });
loop.start();
