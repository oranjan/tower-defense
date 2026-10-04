// DOM UI over the canvas. NAIVE: the HUD is rebuilt with innerHTML every frame.
import { ENEMIES, MAX_LEVEL, TOWERS, WAVE_COUNT, towerDmg, towerRange, towerRate } from './config';
import type { Game, StressConfig, Tower } from './game';
import type { Loop } from './loop';

export interface Controls {
  buildKind: number;
  selected: Tower | null;
  restart(): void;
  toMenu(): void;
  startStress(cfg: StressConfig): void;
  setStress(cfg: StressConfig): void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class UI {
  private hudStats = el('div', 'hud-stats');
  private pauseBtn = el('button', '', 'Pause');
  private speedBtns: HTMLButtonElement[] = [];
  private shopBtns: HTMLButtonElement[] = [];
  private waveBtn = el('button', 'wide primary');
  private towerPanel = el('div', 'panel tower-panel');
  private tpTitle = el('div', 'tp-title');
  private tpStats = el('div', 'tp-stats');
  private upBtn = el('button');
  private sellBtn = el('button', 'danger');
  private overlay = el('div', 'overlay');
  private stressInputs: Record<keyof StressConfig, HTMLInputElement> = {} as never;
  private stressVals: Record<keyof StressConfig, HTMLSpanElement> = {} as never;
  private overlayKey = '-'; // never a real key, so the first update always applies

  constructor(private g: Game, private loop: Loop, private c: Controls) {
    this.buildHud();
    this.buildSide();
    $('#stage').appendChild(this.overlay);
  }

  private buildHud() {
    const hud = $('#hud');
    const right = el('div', 'hud-right');
    this.pauseBtn.onclick = () => this.togglePause();
    right.appendChild(this.pauseBtn);
    for (const s of [1, 2, 4]) {
      const b = el('button', '', s + '×');
      b.onclick = () => (this.loop.speed = s);
      this.speedBtns.push(b);
      right.appendChild(b);
    }
    const restart = el('button', '', 'Restart');
    restart.onclick = () => this.c.restart();
    const menu = el('button', '', 'Menu');
    menu.onclick = () => this.c.toMenu();
    right.append(restart, menu);
    hud.append(el('div', 'logo', 'TOWER<b>DEFENSE</b>'), this.hudStats, right);
  }

  private buildSide() {
    const side = $('#side');

    side.appendChild(el('h3', '', 'Towers'));
    const shop = el('div', 'shop');
    TOWERS.forEach((t, k) => {
      const b = el('button', 'shop-btn',
        `<span class="sw" style="background:${t.color}"></span><span class="nm">${t.name} <kbd>${k + 1}</kbd></span>` +
        `<span class="cost">${t.cost}g</span><span class="ds">${t.desc}</span>`);
      b.onclick = () => (this.c.buildKind = this.c.buildKind === k ? -1 : k);
      this.shopBtns.push(b);
      shop.appendChild(b);
    });
    side.appendChild(shop);

    this.waveBtn.onclick = () => this.g.callNextWave();
    side.appendChild(this.waveBtn);

    this.upBtn.onclick = () => this.c.selected && this.g.upgrade(this.c.selected);
    this.sellBtn.onclick = () => {
      if (this.c.selected) {
        this.g.sell(this.c.selected);
        this.c.selected = null;
      }
    };
    const row = el('div', 'row');
    row.append(this.upBtn, this.sellBtn);
    this.towerPanel.append(this.tpTitle, this.tpStats, row);
    side.appendChild(this.towerPanel);

    const enemies = el('div', 'panel legend');
    enemies.innerHTML = '<h3>Enemies</h3>' + ENEMIES.map((e) =>
      `<div><span class="dot" style="background:${e.color}"></span>${e.name} <small>${e.hp}hp · ${e.speed}px/s${e.armor ? ' · armor ' + e.armor : ''}</small></div>`).join('');
    side.appendChild(enemies);

    const stress = el('div', 'panel stress');
    stress.appendChild(el('h3', '', 'Stress test'));
    const defs: [keyof StressConfig, string, number, number][] = [
      ['enemies', 'Enemies', 10000, 5000],
      ['towers', 'Towers', 200, 100],
      ['projectiles', 'Projectiles', 3000, 1000],
    ];
    for (const [key, label, max, def] of defs) {
      const wrap = el('label', 'slider');
      const val = el('span', 'val', String(def));
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.step = key === 'towers' ? '1' : '50';
      input.value = String(def);
      input.oninput = () => {
        val.textContent = input.value;
        if (this.g.stress) this.c.setStress(this.stressCfg());
      };
      wrap.append(el('span', '', label), val, input);
      stress.appendChild(wrap);
      this.stressInputs[key] = input;
      this.stressVals[key] = val;
    }
    const presets = el('div', 'row');
    for (const [name, e, t, p] of [['S1', 2000, 50, 500], ['S2', 5000, 100, 1000]] as const) {
      const b = el('button', '', `${name} ${e}/${t}/${p}`);
      b.onclick = () => {
        this.setStressInputs({ enemies: e, towers: t, projectiles: p });
        this.c.startStress(this.stressCfg());
      };
      presets.appendChild(b);
    }
    const go = el('button', 'wide', 'Start stress test');
    go.onclick = () => this.c.startStress(this.stressCfg());
    stress.append(presets, go);
    side.appendChild(stress);

    side.appendChild(el('div', 'help',
      '<b>Controls</b><br>Click tile: build · Click tower: select<br><kbd>1</kbd>–<kbd>4</kbd> towers · <kbd>U</kbd> upgrade · <kbd>X</kbd> sell<br>' +
      '<kbd>Space</kbd> pause · <kbd>N</kbd> next wave · <kbd>R</kbd> restart<br><kbd>+</kbd>/<kbd>-</kbd> speed · wheel zoom · drag / WASD pan · <kbd>Esc</kbd> cancel'));
  }

  stressCfg(): StressConfig {
    return {
      enemies: +this.stressInputs.enemies.value,
      towers: +this.stressInputs.towers.value,
      projectiles: +this.stressInputs.projectiles.value,
    };
  }

  setStressInputs(cfg: StressConfig) {
    for (const k of Object.keys(cfg) as (keyof StressConfig)[]) {
      this.stressInputs[k].value = String(cfg[k]);
      this.stressVals[k].textContent = String(cfg[k]);
    }
  }

  togglePause() {
    if (this.g.phase === 'playing') this.loop.paused = !this.loop.paused;
  }

  // Called every frame (naive: no dirty checking)
  update() {
    const g = this.g;
    const wave = g.stress ? 'stress' : `${g.wave} / ${WAVE_COUNT}`;
    this.hudStats.innerHTML =
      `<span class="stat gold">Gold <b>${g.stress ? '∞' : g.gold}</b></span>` +
      `<span class="stat lives">Lives <b>${g.stress ? '∞' : g.lives}</b></span>` +
      `<span class="stat">Wave <b>${wave}</b></span>` +
      `<span class="stat">Score <b>${g.score}</b></span>` +
      `<span class="stat">Enemies <b>${g.enemies.length}</b></span>`;

    this.pauseBtn.textContent = this.loop.paused ? 'Resume' : 'Pause';
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', this.loop.speed === [1, 2, 4][i]));
    this.shopBtns.forEach((b, k) => {
      b.classList.toggle('on', this.c.buildKind === k);
      b.classList.toggle('poor', !g.stress && g.gold < TOWERS[k].cost);
    });

    if (g.stress) {
      this.waveBtn.textContent = 'Stress test running';
      this.waveBtn.disabled = true;
    } else if (g.waveActive) {
      this.waveBtn.textContent = `Wave ${g.wave} spawning…`;
      this.waveBtn.disabled = true;
    } else if (g.wave >= WAVE_COUNT) {
      this.waveBtn.textContent = 'Final wave — hold on!';
      this.waveBtn.disabled = true;
    } else if (g.countdown > 0) {
      this.waveBtn.textContent = `Wave ${g.wave + 1} in ${Math.ceil(g.countdown)}s — call now +${g.earlyBonus()}g`;
      this.waveBtn.disabled = false;
    } else {
      this.waveBtn.textContent = `Start wave ${g.wave + 1}`;
      this.waveBtn.disabled = g.phase !== 'playing';
    }

    const t = this.c.selected;
    this.towerPanel.style.display = t ? '' : 'none';
    if (t) {
      const def = TOWERS[t.kind];
      this.tpTitle.innerHTML = `<span class="sw" style="background:${def.color}"></span>${def.name} <small>level ${t.level + 1}/${MAX_LEVEL + 1}</small>`;
      const next = t.level < MAX_LEVEL ? t.level + 1 : t.level;
      const arrow = (a: number, b: number, d = 0) => (t.level < MAX_LEVEL ? `${a.toFixed(d)} → <b>${b.toFixed(d)}</b>` : a.toFixed(d));
      this.tpStats.innerHTML =
        `<div>Damage ${arrow(towerDmg(t.kind, t.level), towerDmg(t.kind, next), 1)}</div>` +
        `<div>Range ${arrow(towerRange(t.kind, t.level), towerRange(t.kind, next))}</div>` +
        `<div>Rate ${arrow(towerRate(t.kind, t.level), towerRate(t.kind, next), 2)}/s</div>` +
        `<div>Kills ${t.kills}</div>`;
      const cost = g.nextUpgradeCost(t);
      this.upBtn.textContent = cost === Infinity ? 'Max level' : `Upgrade (U) ${cost}g`;
      this.upBtn.disabled = cost === Infinity || g.gold < cost;
      this.sellBtn.textContent = `Sell (X) +${g.sellValue(t)}g`;
    }

    this.updateOverlay();
  }

  private updateOverlay() {
    const g = this.g;
    const key = g.phase === 'playing' ? (this.loop.paused ? 'paused' : '') : g.phase + g.score;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.overlay.style.display = key ? '' : 'none';
    if (!key) return;

    if (g.phase === 'menu') {
      this.overlay.innerHTML =
        '<div class="card"><h1>Tower Defense</h1><p>Hold the line for 50 waves. Build Guns, Cannons, Frost and Snipers along the road, upgrade them, and keep the enemies away from your base.</p>' +
        '<div class="row"><button class="primary big" data-a="play">Play</button><button class="big" data-a="stress">Stress test</button></div></div>';
    } else if (key === 'paused') {
      this.overlay.innerHTML = '<div class="card"><h1>Paused</h1><p>Press Space to resume.</p><div class="row"><button class="primary big" data-a="resume">Resume</button><button class="big" data-a="play">Restart</button></div></div>';
    } else {
      const win = g.phase === 'victory';
      this.overlay.innerHTML =
        `<div class="card"><h1>${win ? 'Victory!' : 'Game over'}</h1><p>${win ? 'All 50 waves held.' : `The base fell on wave ${g.wave}.`}</p>` +
        `<p class="score">Score <b>${g.score}</b> · Kills <b>${g.kills}</b></p><div class="row"><button class="primary big" data-a="play">Play again</button><button class="big" data-a="menu">Menu</button></div></div>`;
    }
    this.overlay.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'play') this.c.restart();
        else if (a === 'stress') this.c.startStress(this.stressCfg());
        else if (a === 'resume') this.loop.paused = false;
        else if (a === 'menu') this.c.toMenu();
      };
    });
  }
}
