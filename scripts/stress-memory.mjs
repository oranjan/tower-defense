// 50-wave run UNDER STRESS LOAD (brief: "during the stress scenario ... memory usage must remain broadly stable
// during a complete 50-wave run").
//
//   npm run stress-memory -- http://localhost:4317/ [E,T,P]
//
// Starts the 50-wave stress run (default 5000/100/1000): enemy, tower and projectile counts are held constant
// while waves 1..50 advance every STRESS_WAVE_SECONDS. Enemies are mortal and use each wave's real mix and HP;
// every kill is replaced immediately, so spawning, killing and pooling churn for the whole run.
// Runs in real time at 1x (about 5 minutes) and samples heap + frame stats every 5 s.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://localhost:4317/';
const [E, T, P] = (process.argv[3] || '5000,100,1000').split(',').map(Number);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-precise-memory-info'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate((cfg) => {
  for (const f of Object.keys(flags)) flags[f] = true;
  ui.syncFlags();
  game.startStress(cfg);
}, { enemies: E, towers: T, projectiles: P, waves: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const samples = [];
for (;;) {
  await page.evaluate(() => resetStats());
  await sleep(5000);
  const s = await page.evaluate(() => {
    const row = statsRow().split('|').map((c) => c.trim());
    return {
      wave: game.wave, phase: game.phase, kills: game.kills, alive: game.enemies.length,
      fps: +row[3], at45: +row[5], over33: +row[6],
      heap: performance.memory.usedJSHeapSize / 1048576,
    };
  });
  samples.push(s);
  process.stderr.write(`wave ${s.wave} heap ${s.heap.toFixed(1)} MB fps ${s.fps} ≥45 ${s.at45}% kills ${s.kills}\n`);
  if (s.phase !== 'playing') break;
}

console.log(`### 50-wave stress run — ${E}/${T}/${P}, real time at 1×\n`);
console.log('| Waves | heap min MB | heap max MB | FPS (avg) | ≥45 FPS % (worst 5 s window) | >33 ms % (worst 5 s window) | kills so far |\n|---|---|---|---|---|---|---|');
for (let w0 = 1; w0 <= 50; w0 += 5) {
  const b = samples.filter((s) => s.wave >= w0 && s.wave < w0 + 5);
  if (!b.length) continue;
  const heaps = b.map((s) => s.heap);
  console.log(`| ${w0}–${w0 + 4} | ${Math.min(...heaps).toFixed(1)} | ${Math.max(...heaps).toFixed(1)} | ${(b.reduce((a, s) => a + s.fps, 0) / b.length).toFixed(1)} | ${Math.min(...b.map((s) => s.at45)).toFixed(1)} | ${Math.max(...b.map((s) => s.over33)).toFixed(1)} | ${b[b.length - 1].kills} |`);
}
const all = samples.slice(0, -1).length ? samples.slice(0, -1) : samples;
const heaps = all.map((s) => s.heap);
console.log(`\nWhole run: ${all.length} windows · heap ${Math.min(...heaps).toFixed(1)}–${Math.max(...heaps).toFixed(1)} MB · mean ≥45 FPS ${(all.reduce((a, s) => a + s.at45, 0) / all.length).toFixed(1)}% · mean >33 ms ${(all.reduce((a, s) => a + s.over33, 0) / all.length).toFixed(1)}% · enemies killed and replaced: ${samples[samples.length - 1].kills}`);
if (errors.length) console.log('\nPage errors:', errors);
await browser.close();
