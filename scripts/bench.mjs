// Headless stress benchmark. Prints one NUMBERS.md row per scenario.
//
//   npm run bench -- [url] E,T,P [E,T,P ...]
//   npm run bench -- http://localhost:5173/ 2000,50,500 5000,100,1000
//
// Headless numbers are indicative only (no vsync, different GPU path). The figures quoted in the
// video come from desktop Chrome via the in-game "Copy stats row" button. See docs/performance/measurement.md.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WARMUP_MS = +(process.env.WARMUP_MS || 5000);

let args = process.argv.slice(2);
const url = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:5173/';
if (!args.length) args = ['2000,50,500', '5000,100,1000'];

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

console.log(`# ${url}`);
console.log('| Build | E/T/P | FPS | p95 ms | ≥45 FPS % | >33 ms % | sim ms | render ms | heap MB |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const scenario of args) {
  const [enemies, towers, projectiles] = scenario.split(',').map(Number);
  await page.evaluate((cfg) => window.game.startStress(cfg), { enemies, towers, projectiles });
  await new Promise((r) => setTimeout(r, WARMUP_MS));
  // The copy button logs the markdown row to the console and returns it via the clipboard; read it from the page instead.
  const row = await page.evaluate(() => window.statsRow?.());
  console.log(row ?? '(statsRow() not exposed by this build)');
}
if (errors.length) console.log('\nPage errors:', errors);
await browser.close();
