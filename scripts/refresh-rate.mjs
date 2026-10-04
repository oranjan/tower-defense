// Refresh-rate independence (brief: "game behavior must remain consistent across displays with different
// refresh rates").
//
//   npm run refresh-rate -- http://localhost:4317/
//
// For each display rate, a fresh Game with the same towers plays wave 1 onward, driven by the REAL Loop
// class with synthetic requestAnimationFrame timestamps spaced 1000/Hz ms apart. We record:
//   - how much wall-clock time it takes to reach the same number of simulation steps (should be the same:
//     game speed doesn't depend on the display rate)
//   - the full game state after exactly that many steps (should be identical: same outcome at any rate)
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://localhost:4317/';
const STEPS = 60 * 180; // 3 minutes of game time

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0' });
const rows = await page.evaluate((STEPS) => {
  const realRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0; // we drive frames ourselves
  const out = [];
  for (const hz of [30, 60, 75, 120, 144, 165, 240]) {
    const g = new Game();
    g.start();
    for (const [c, r, k] of [[5, 3, 0], [9, 3, 2], [13, 3, 1], [17, 4, 0], [6, 8, 0], [10, 8, 3], [14, 7, 1], [18, 9, 2]]) {
      g.gold += 500;
      g.place(k, c, r);
    }
    g.callNextWave();
    let steps = 0, snap = null, frames = 0;
    const loop = new Loop({
      update: (dt) => {
        if (steps >= STEPS) return;
        g.update(dt);
        if (++steps === STEPS) {
          let sumS = 0;
          for (const e of g.enemies) sumS += e.s;
          snap = { wave: g.wave, gold: g.gold, score: g.score, kills: g.kills, lives: g.lives, enemies: g.enemies.length, sumS: sumS.toFixed(3), simTime: g.time.toFixed(4) };
        }
      },
      render: () => {},
    }, { record() {} });
    let t = 1000;
    while (!snap) {
      loop.frame(t);
      frames++;
      t += 1000 / hz;
    }
    out.push({ hz, frames, wallSeconds: ((t - 1000 - 1000 / hz) / 1000).toFixed(2), ...snap });
  }
  window.requestAnimationFrame = realRaf;
  return out;
}, STEPS);
await browser.close();

console.log(`### Refresh-rate independence — ${STEPS} fixed steps (${STEPS / 60} s of game time)\n`);
console.log('| Display Hz | frames rendered | wall-clock s to reach it | wave | gold | score | kills | lives | enemies alive | Σ enemy path distance |\n|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.hz} | ${r.frames} | ${r.wallSeconds} | ${r.wave} | ${r.gold} | ${r.score} | ${r.kills} | ${r.lives} | ${r.enemies} | ${r.sumS} |`);
const keys = ['wave', 'gold', 'score', 'kills', 'lives', 'enemies', 'sumS', 'simTime'];
const same = rows.every((r) => keys.every((k) => r[k] === rows[0][k]));
console.log(`\nGame state identical at every refresh rate: **${same ? 'yes' : 'NO'}**`);
