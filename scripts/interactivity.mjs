// "The game must remain interactive" during the stress scenario.
//
//   npm run interactivity -- http://localhost:4317/ [E,T,P]
//
// Starts the stress scenario, then performs real input through Chrome (keys, clicks on the map and the UI,
// mouse-wheel zoom) and reads the browser's Event Timing API: for each interaction, `duration` is the time
// from the input to the next frame painted after it was handled (the same measure behind Interaction to Next
// Paint). Under 100 ms feels instant; Google treats an INP under 200 ms as "good".
// Runs the final build and the frozen naive build (<url>naive/) for comparison.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = (process.argv[2] || 'http://localhost:4317/').replace(/\/?$/, '/');
const [E, T, P] = (process.argv[3] || '5000,100,1000').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1440, height: 900 } });

async function run(label, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((cfg) => {
    game.startStress(cfg);
    window.__ev = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) window.__ev.push({ name: e.name, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  }, { enemies: E, towers: T, projectiles: P });
  await sleep(2000);
  const canvas = await page.$('#fg');
  const box = await canvas.boundingBox();
  const actions = [];
  for (let i = 0; i < 4; i++) {
    actions.push(['key 1 (pick Gun)', () => page.keyboard.press('1')]);
    actions.push(['click map (place)', () => page.mouse.click(box.x + 60 + i * 70, box.y + box.height * 0.8)]);
    actions.push(['key Escape', () => page.keyboard.press('Escape')]);
    actions.push(['click tower (select)', () => page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)]);
    actions.push(['click 2x speed button', () => page.click('.hud-right button:nth-child(3)')]);
    actions.push(['key Space (pause)', () => page.keyboard.press('Space')]);
    actions.push(['key Space (resume)', () => page.keyboard.press('Space')]);
  }
  for (const [, act] of actions) {
    await act();
    await sleep(250);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel({ deltaY: -200 });
    await sleep(250);
  }
  await sleep(500);
  const ev = await page.evaluate(() => window.__ev);
  const fps = await page.evaluate(() => statsRow().split('|')[3].trim());
  await page.close();
  const d = ev.map((e) => e.duration).sort((a, b) => a - b);
  const p = (q) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * q))] : 0);
  return `| ${label} | ${E}/${T}/${P} | ${fps} | ${actions.length + 3} | ${d.length} | ${p(0.5).toFixed(0)} | ${p(0.98).toFixed(0)} | ${(d[d.length - 1] ?? 0).toFixed(0)} |`;
}

console.log(`### Interactivity under stress — input-to-next-paint (Event Timing API)\n`);
console.log('| Build | E/T/P | FPS | inputs sent | event entries | median ms | p98 ms (≈INP) | worst ms |\n|---|---|---|---|---|---|---|---|');
console.log(await run('Final (all optimisations)', base));
console.log(await run('Naive v0', base + 'naive/'));
await browser.close();
