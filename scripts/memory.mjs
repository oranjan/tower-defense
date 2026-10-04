// Memory over a complete 50-wave run (brief: "memory usage must remain broadly stable").
//
//   npm run memory -- http://localhost:4317/            # optimised build (pools on)
//   npm run memory -- http://localhost:4317/ nopool     # same game with object pooling switched off
//
// A scripted player builds a strong defence (best road-coverage tiles, Gun/Frost/Cannon/Sniper mix,
// upgrades with spare gold) and plays all 50 waves fast-forwarded in fixed 1/60 s steps. The page yields
// between 10 s chunks of game time so the GC runs normally. JS heap is sampled after every chunk and
// reported as min / max / last per 5 waves.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://localhost:4317/';
const pool = process.argv[3] !== 'nopool';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-precise-memory-info'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate((pool) => {
  flags.usePool = pool;
  ui.syncFlags();
  const g = game;
  g.start();
  const TILE = 64, COLS = 24, ROWS = 14, road = [], tiles = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!g.canPlace(0, c, r)) road.push([(c + 0.5) * TILE, (r + 0.5) * TILE]);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    let cov = 0;
    for (const [x, y] of road) if (Math.hypot(x - (c + 0.5) * TILE, y - (r + 0.5) * TILE) < 150) cov++;
    tiles.push({ c, r, cov });
  }
  tiles.sort((a, b) => b.cov - a.cov);
  window.bot = { tiles, built: 0, step: 0, rot: [0, 2, 1, 3, 1, 3, 2, 1] };
}, pool);

console.log(`### 50-wave run — pools ${pool ? 'ON' : 'OFF'}\n`);
console.log('| Waves | heap min MB | heap max MB | heap at end MB | enemies alive | particles |\n|---|---|---|---|---|---|');
let bucket = null;
const flush = (r) => console.log(`| ${bucket.from}–${r.wave} | ${bucket.min.toFixed(1)} | ${bucket.max.toFixed(1)} | ${r.heap.toFixed(1)} | ${r.enemies} | ${r.particles} |`);
for (;;) {
  const r = await page.evaluate(() => {
    const g = game, b = bot, COST = [50, 120, 80, 200];
    for (let i = 0; i < 600 && g.phase === 'playing'; i++, b.step++) {
      if (b.step % 30 === 0) {
        for (let t = 0; t < 3; t++) {
          const want = b.rot[b.built % b.rot.length];
          let cheapest = null;
          for (const tw of g.towers) if (!cheapest || g.nextUpgradeCost(tw) < g.nextUpgradeCost(cheapest)) cheapest = tw;
          if (cheapest && g.towers.length >= 6 && b.step % 60 === 0 && g.gold >= g.nextUpgradeCost(cheapest)) { g.upgrade(cheapest); continue; }
          if (g.gold >= COST[want]) {
            const s = b.tiles.find((s) => g.canPlace(want, s.c, s.r));
            if (s) { g.place(want, s.c, s.r); b.built++; continue; }
          }
          break;
        }
        if (g.wave === 0) g.callNextWave();
      }
      g.update(1 / 60);
    }
    return { wave: g.wave, phase: g.phase, lives: g.lives, heap: performance.memory.usedJSHeapSize / 1048576, enemies: g.enemies.length, particles: g.particles.length };
  });
  if (!bucket) bucket = { from: r.wave, min: r.heap, max: r.heap };
  bucket.min = Math.min(bucket.min, r.heap);
  bucket.max = Math.max(bucket.max, r.heap);
  if (r.phase !== 'playing') {
    flush(r);
    console.log(`\nResult: **${r.phase}** at wave ${r.wave}, ${r.lives} lives left.`);
    break;
  }
  if (r.wave >= bucket.from + 5) {
    flush(r);
    bucket = null;
  }
  await new Promise((res) => setTimeout(res, 20));
}
await browser.close();
