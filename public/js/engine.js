// NEONVIPER engine: game loop, rules, rendering, all the juice.
import { Snake } from './snake.js';
import { Enemy } from './enemy.js';
import { Particles, Shake } from './particles.js';
import { POWERUPS, FOOD_TYPES, POWER_KEYS } from './powerups.js';
import * as audio from './audio.js';

const GRID_PRESETS = { small: 22, medium: 30, large: 40 };

export class Engine {
  constructor(canvas, settings, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.hooks = hooks || {};
    this.state = 'idle'; // idle|countdown|playing|paused|over
    this.particles = new Particles();
    this.shake = new Shake();
    this.shake.enabled = settings.screenShake;
    this._raf = null;
    this._last = 0;
    this.acc = 0;
    this.time = 0;
    this.bind();
  }

  bind() {
    const resize = () => this.layout();
    window.addEventListener('resize', resize);
    this.layout();
  }

  layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const margin = window.innerWidth < 640 ? 8 : 40;
    const avail = Math.min(window.innerWidth - margin * 2, window.innerHeight - margin * 2, 820);
    this.cols = this.rows = GRID_PRESETS[this.settings.gridSize] || 30;
    this.cell = Math.floor(avail / this.cols);
    const px = this.cell * this.cols;
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
    this.canvas.width = px * dpr;
    this.canvas.height = px * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.px = px;
  }

  // ---------------- lifecycle ----------------
  start(mode) {
    this.mode = mode;
    this.layout();
    this.snake = new Snake(Math.floor(this.cols / 2), Math.floor(this.rows / 2), { x: 1, y: 0 }, '#00ffd5', true);
    this.enemies = [];
    this.obstacles = [];
    this.portals = [];
    this.foods = [];
    this.activePowers = {}; // key -> remaining seconds
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.spellCharges = 3;
    this.time = 0;
    this.acc = 0;
    this.deaths = 0;
    this.risingTimer = 0;
    this.eatCount = 0;

    this.buildObstacles();
    this.buildPortals();
    this.spawnEnemies();
    for (let i = 0; i < 1; i++) this.spawnFood();
    if (mode.id === 'rival') this.spawnFood(); // extra contested food

    this.state = 'countdown';
    this.countdown = 3;
    this.hooks.onStart && this.hooks.onStart();
    this.updateHud();
    this.loop(performance.now());
    this.runCountdown();
  }

  runCountdown() {
    const el = this.hooks.countdownEl;
    const tick = () => {
      if (this.state !== 'countdown') return;
      if (this.countdown > 0) {
        if (el) { el.classList.remove('hidden'); el.textContent = this.countdown; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
        audio.sfx.turn();
        this.countdown--;
        setTimeout(tick, 700);
      } else {
        if (el) { el.textContent = 'GO!'; el.style.color = 'var(--neon3)'; }
        audio.sfx.start();
        setTimeout(() => { if (el) { el.classList.add('hidden'); el.style.color = ''; } this.state = 'playing'; }, 500);
      }
    };
    tick();
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.hooks.onPause && this.hooks.onPause(); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this._last = performance.now(); } }

  stop() { this.state = 'idle'; cancelAnimationFrame(this._raf); }

  // ---------------- world building ----------------
  randCell() { return { x: Math.floor(Math.random() * this.cols), y: Math.floor(Math.random() * this.rows) }; }
  isOccupied(x, y) {
    if (this.snake && this.snake.occupies(x, y)) return true;
    for (const e of this.enemies) if (e.occupies(x, y)) return true;
    for (const o of this.obstacles) if (o.x === x && o.y === y) return true;
    for (const p of this.portals) if (p.x === x && p.y === y) return true;
    for (const f of this.foods) if (f.x === x && f.y === y) return true;
    return false;
  }
  freeCell() {
    for (let i = 0; i < 400; i++) { const c = this.randCell(); if (!this.isOccupied(c.x, c.y)) return c; }
    return this.randCell();
  }

  buildObstacles() {
    const n = this.mode.obstacles || 0;
    const cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    for (let i = 0; i < n; i++) {
      let c, tries = 0;
      do { c = this.randCell(); tries++; }
      while (tries < 60 && (Math.abs(c.x - cx) + Math.abs(c.y - cy) < 5 || this.isOccupied(c.x, c.y)));
      this.obstacles.push(c);
    }
  }
  buildPortals() {
    if (!this.mode.portals) return;
    for (let i = 0; i < this.mode.portals; i++) {
      const a = this.freeCell(); this.portals.push({ ...a, pair: null, color: i % 2 ? '#ff2bd1' : '#00ffd5' });
      const b = this.freeCell(); this.portals.push({ ...b, pair: null, color: i % 2 ? '#ff2bd1' : '#00ffd5' });
      this.portals[this.portals.length - 2].pair = this.portals[this.portals.length - 1];
      this.portals[this.portals.length - 1].pair = this.portals[this.portals.length - 2];
    }
  }
  spawnEnemies() {
    const n = this.mode.enemies || 0;
    const colors = ['#ff2bd1', '#ffae00', '#7af'];
    for (let i = 0; i < n; i++) {
      const c = this.freeCell();
      this.enemies.push(new Enemy(c.x, c.y, colors[i % colors.length], this.cols, this.rows));
    }
  }

  pickFoodType() {
    const types = Object.entries(FOOD_TYPES);
    const total = types.reduce((s, [, t]) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const [k, t] of types) { if ((r -= t.weight) <= 0) return k; }
    return 'normal';
  }
  spawnFood(forceType) {
    const c = this.freeCell();
    const type = forceType || this.pickFoodType();
    this.foods.push({ ...c, type, ...FOOD_TYPES[type], born: this.time });
  }

  // ---------------- main loop ----------------
  loop(now) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    if (!this._last) this._last = now;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.1) dt = 0.1;

    if (this.state === 'playing') {
      this.time += dt;
      this.update(dt);
    }
    this.particles.update(dt);
    this.shake.update(dt);
    this.render();
  }

  stepInterval() {
    let speed = this.mode.baseSpeed;
    speed += Math.min(6, this.eatCount * 0.12); // difficulty ramp
    if (this.activePowers.speed) speed *= 1.7;
    if (this.activePowers.timewarp) speed *= 0.45;
    return 1 / speed;
  }

  update(dt) {
    // power timers (real-time)
    for (const k of Object.keys(this.activePowers)) {
      this.activePowers[k] -= dt;
      if (this.activePowers[k] <= 0) { delete this.activePowers[k]; this.onPowerEnd(k); }
    }
    this.snake.ghost = !!this.activePowers.ghost;

    // combo decay
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 1; }

    // magnet drift
    if (this.activePowers.magnet) this.applyMagnet();

    // rising walls
    if (this.mode.risingWalls) {
      this.risingTimer += dt;
      if (this.risingTimer > 7) { this.risingTimer = 0; this.addRisingLayer(); }
    }

    // grid steps
    this.acc += dt;
    const si = this.stepInterval();
    let guard = 0;
    while (this.acc >= si && this.state === 'playing' && guard < 5) {
      this.acc -= si;
      this.logicStep();
      guard++;
    }
    this.tInterp = Math.min(1, this.acc / si);
  }

  applyMagnet() {
    const h = this.snake.head();
    for (const f of this.foods) {
      const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
      if (d > 1 && d < 8 && Math.random() < 0.25) {
        const nx = f.x + Math.sign(h.x - f.x) * (Math.random() < 0.6 ? 1 : 0);
        const ny = f.y + Math.sign(h.y - f.y) * (Math.random() < 0.6 ? 1 : 0);
        if (!this.isOccupied(nx, ny)) { f.x = nx; f.y = ny; }
      }
    }
  }

  addRisingLayer() {
    const layer = Math.floor(this.risingLayers || 0);
    this.risingLayers = (this.risingLayers || 0) + 1;
    const m = this.risingLayers;
    if (m >= Math.floor(this.cols / 2) - 2) return;
    for (let x = m; x < this.cols - m; x++) {
      this.tryAddWall(x, m); this.tryAddWall(x, this.rows - 1 - m);
    }
    for (let y = m; y < this.rows - m; y++) {
      this.tryAddWall(m, y); this.tryAddWall(this.cols - 1 - m, y);
    }
    this.shake.add(6, 0.3);
    audio.sfx.fail();
  }
  tryAddWall(x, y) {
    if (this.snake.occupies(x, y)) return; // don't bury the player instantly
    if (this.foods.some((f) => f.x === x && f.y === y)) return;
    if (this.obstacles.some((o) => o.x === x && o.y === y)) return;
    this.obstacles.push({ x, y, rising: true });
  }

  logicStep() {
    const wrap = (this.mode.wrap || this.snake.ghost) ? { cols: this.cols, rows: this.rows } : null;

    // enemies think + step
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.think(this.foods, this.obstacles, [this.snake, ...this.enemies.filter((x) => x !== e && x.alive)], this.mode.wrap ? { cols: this.cols, rows: this.rows } : null);
      e.step(this.mode.wrap ? { cols: this.cols, rows: this.rows } : null);
    }

    this.snake.step(wrap);
    if (this.snake.queue.length === 0) {} // turn buffer consumed

    // portals
    this.handlePortals(this.snake);
    for (const e of this.enemies) this.handlePortals(e);

    // collisions for player
    if (!this.snake.ghost && this.checkPlayerCollision()) { this.die(); return; }

    // enemy collisions (they just die & respawn)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this.enemyCollision(e)) { this.killEnemy(e); }
    }

    // eating
    this.handleEating();

    this.updateHud();
  }

  handlePortals(snk) {
    if (!this.portals.length) return;
    const h = snk.head();
    for (const p of this.portals) {
      if (p.x === h.x && p.y === h.y && p.pair) {
        h.x = p.pair.x; h.y = p.pair.y;
        if (snk.isPlayer) { this.particles.ring(this.center(p.x), this.center(p.y), p.color, 30);
          this.particles.ring(this.center(h.x), this.center(h.y), p.pair.color, 30); audio.sfx.spell(); }
        break;
      }
    }
  }

  checkPlayerCollision() {
    const h = this.snake.head();
    if (!this.mode.wrap && (h.x < 0 || h.y < 0 || h.x >= this.cols || h.y >= this.rows)) return true;
    if (this.snake.hitsSelf()) return true;
    for (const o of this.obstacles) if (o.x === h.x && o.y === h.y) return true;
    for (const e of this.enemies) if (e.alive && e.occupies(h.x, h.y)) return true;
    return false;
  }
  enemyCollision(e) {
    const h = e.head();
    if (!this.mode.wrap && (h.x < 0 || h.y < 0 || h.x >= this.cols || h.y >= this.rows)) return true;
    if (e.hitsSelf()) return true;
    for (const o of this.obstacles) if (o.x === h.x && o.y === h.y) return true;
    if (this.snake.occupies(h.x, h.y)) return true;
    for (const other of this.enemies) if (other !== e && other.alive && other.occupies(h.x, h.y)) return true;
    return false;
  }
  killEnemy(e) {
    e.alive = false;
    const h = e.head();
    this.particles.burst(this.center(h.x), this.center(h.y), e.color, 24, { speed: 4 });
    this.shake.add(5, 0.2);
    // respawn after a beat
    setTimeout(() => {
      if (this.state === 'idle') return;
      const c = this.freeCell();
      const ne = new Enemy(c.x, c.y, e.color, this.cols, this.rows);
      const idx = this.enemies.indexOf(e);
      if (idx >= 0) this.enemies[idx] = ne;
    }, 1500);
  }

  handleEating() {
    const h = this.snake.head();
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f.x === h.x && f.y === h.y) { this.eat(f, this.snake, true); this.foods.splice(i, 1); }
    }
    // enemies eat too
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const eh = e.head();
      for (let i = this.foods.length - 1; i >= 0; i--) {
        const f = this.foods[i];
        if (f.x === eh.x && f.y === eh.y) { e.grow += 2; this.foods.splice(i, 1); this.spawnFood(); }
      }
    }
    // keep at least 1-2 foods
    const want = this.mode.id === 'rival' ? 2 : 1;
    while (this.foods.length < want) this.spawnFood();
  }

  eat(f, snk, isPlayer) {
    snk.grow += f.cursed ? 3 : f.type === 'golden' ? 2 : 1;
    if (!isPlayer) return;
    this.eatCount++;
    // combo
    this.combo = Math.min(9, this.combo + 1);
    this.comboTimer = 3;
    const mult = (this.activePowers.multiplier ? 2 : 1) * this.combo;
    const gained = f.score * mult;
    this.score += gained;

    const cx = this.center(f.x), cy = this.center(f.y);
    this.particles.burst(cx, cy, f.color, f.type === 'golden' ? 26 : 14, { speed: f.type === 'golden' ? 5 : 3 });
    if (f.particles === 'ring') this.particles.ring(cx, cy, f.color, 36);
    this.particles.text(cx, cy - 6, '+' + gained, f.color);
    this.shake.add(f.type === 'golden' ? 7 : 3, 0.18);
    audio.sfx.eat(this.combo);
    if (this.combo >= 3) audio.sfx.combo();

    if (f.grantsPower) this.grantRandomPower();
    if (f.cursed) { this.grantPower('speed'); this.shake.add(8, 0.3); } // cursed = points but forced haste

    this.hooks.onEat && this.hooks.onEat(f, this.combo, gained);
    // spawn replacement
    this.spawnFood();
    // occasionally a golden bonus
    if (this.eatCount % 7 === 0) this.spawnFood('golden');
  }

  grantRandomPower() { this.grantPower(POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)]); }
  grantPower(key) {
    const p = POWERUPS[key];
    if (!p) return;
    if (key === 'shrink') { this.shrinkSnake(4); }
    else if (key === 'grow') { this.snake.grow += 4; }
    else if (key === 'clearObstacles') { this.clearObstacles(); }
    else { this.activePowers[key] = p.dur; }
    const h = this.snake.head();
    this.particles.ring(this.center(h.x), this.center(h.y), p.color, 30);
    this.particles.text(this.center(h.x), this.center(h.y) - 20, p.name, p.color);
    audio.sfx.power();
    this.hooks.onPower && this.hooks.onPower(key, p);
  }
  onPowerEnd(key) { this.hooks.onPowerEnd && this.hooks.onPowerEnd(key); }

  shrinkSnake(n) {
    for (let i = 0; i < n && this.snake.body.length > 3; i++) this.snake.body.pop();
    const h = this.snake.head();
    this.particles.burst(this.center(h.x), this.center(h.y), '#9f9', 18);
  }
  clearObstacles() {
    for (const o of this.obstacles) this.particles.burst(this.center(o.x), this.center(o.y), '#f55', 6, { speed: 2, life: 0.4 });
    this.obstacles = [];
    this.risingLayers = 0;
    this.shake.add(10, 0.4);
  }

  // spell console effect dispatch
  castEffect(effect) {
    switch (effect) {
      case 'speed': case 'timewarp': case 'ghost': case 'magnet': case 'multiplier':
        this.grantPower(effect); break;
      case 'shrink': this.grantPower('shrink'); break;
      case 'grow': this.grantPower('grow'); break;
      case 'clearObstacles': this.grantPower('clearObstacles'); break;
      default: return false;
    }
    return true;
  }

  die() {
    if (this.snake.ghost) return;
    this.state = 'over';
    const h = this.snake.head();
    this.particles.burst(this.center(h.x), this.center(h.y), this.snake.color, 40, { speed: 6, life: 0.9 });
    this.shake.add(14, 0.5);
    audio.sfx.die();
    audio.stopMusic();
    this.hooks.onGameOver && this.hooks.onGameOver({ score: this.score, length: this.snake.length(), eats: this.eatCount, time: this.time });
  }

  // ---------------- input ----------------
  input(dir) {
    if (this.state !== 'playing') return;
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    if (map[dir]) { this.snake.setDir(map[dir]); audio.sfx.turn(); }
  }

  // ---------------- HUD bridge ----------------
  updateHud() {
    this.hooks.onHud && this.hooks.onHud({
      score: this.score, best: this.hooks.best || 0, length: this.snake ? this.snake.length() : 0,
      combo: this.combo, comboTimer: this.comboTimer, mode: this.mode.name,
      powers: this.activePowers, spellCharges: this.spellCharges,
    });
  }

  center(c) { return c * this.cell + this.cell / 2; }

  // ---------------- rendering ----------------
  render() {
    const ctx = this.ctx;
    const off = this.shake.offset();
    ctx.clearRect(0, 0, this.px, this.px);
    ctx.save();
    ctx.translate(off.x, off.y);

    this.drawGrid(ctx);
    this.drawObstacles(ctx);
    this.drawPortals(ctx);
    this.drawFoods(ctx);
    for (const e of this.enemies) if (e.alive) this.drawSnake(ctx, e, false);
    if (this.snake) this.drawSnake(ctx, this.snake, true);
    this.particles.draw(ctx);

    ctx.restore();
    if (this.settings.crt) this.drawScanlines(ctx);
    this.drawVignette(ctx);
  }

  drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(0,255,213,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= this.cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * this.cell, 0); ctx.lineTo(i * this.cell, this.px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * this.cell); ctx.lineTo(this.px, i * this.cell); ctx.stroke();
    }
  }

  drawObstacles(ctx) {
    for (const o of this.obstacles) {
      const x = o.x * this.cell, y = o.y * this.cell;
      ctx.fillStyle = o.rising ? 'rgba(255,80,80,0.85)' : 'rgba(120,140,180,0.6)';
      ctx.shadowBlur = o.rising ? 12 : 0; ctx.shadowColor = '#f55';
      this.roundRect(ctx, x + 1, y + 1, this.cell - 2, this.cell - 2, 4); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawPortals(ctx) {
    const t = this.time * 4;
    for (const p of this.portals) {
      const cx = this.center(p.x), cy = this.center(p.y);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t);
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.shadowBlur = 16; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(0, 0, this.cell * 0.42, 0, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, this.cell * 0.25, Math.PI, Math.PI * 2.6); ctx.stroke();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  drawFoods(ctx) {
    for (const f of this.foods) {
      const cx = this.center(f.x), cy = this.center(f.y);
      const pulse = 1 + Math.sin(this.time * 6 + f.x) * 0.12;
      const r = this.cell * 0.34 * pulse;
      ctx.fillStyle = f.color; ctx.shadowBlur = 16; ctx.shadowColor = f.color;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `${Math.floor(this.cell * 0.6)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.icon, cx, cy + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawSnake(ctx, snk, isPlayer) {
    const t = this.tInterp || 0;
    const wrap = (this.mode.wrap || snk.ghost) ? { cols: this.cols, rows: this.rows } : null;
    const ghost = isPlayer && snk.ghost;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    const col = snk.color;
    // body as connected glowing segments
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.shadowBlur = isPlayer ? 16 : 10; ctx.shadowColor = col;
    ctx.lineWidth = this.cell * 0.78;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < snk.body.length; i++) {
      const pos = snk.interp(i, t, this.cell, wrap);
      const x = pos.x + this.cell / 2, y = pos.y + this.cell / 2;
      // break the path on wrap jumps
      if (i > 0) {
        const prevPos = snk.interp(i - 1, t, this.cell, wrap);
        const px = prevPos.x + this.cell / 2, py = prevPos.y + this.cell / 2;
        if (Math.abs(px - x) > this.cell * 1.5 || Math.abs(py - y) > this.cell * 1.5) { started = false; }
      }
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // tapered tail / inner highlight
    ctx.shadowBlur = 0;
    const head = snk.interp(0, t, this.cell, wrap);
    const hx = head.x + this.cell / 2, hy = head.y + this.cell / 2;
    ctx.fillStyle = isPlayer ? '#eafffb' : '#fff';
    ctx.beginPath(); ctx.arc(hx, hy, this.cell * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(hx, hy, this.cell * 0.3, 0, Math.PI * 2); ctx.fill();
    // eyes
    const d = snk.dir;
    ctx.fillStyle = '#04201b';
    const ox = d.y !== 0 ? this.cell * 0.16 : 0, oy = d.x !== 0 ? this.cell * 0.16 : 0;
    const fx = d.x * this.cell * 0.12, fy = d.y * this.cell * 0.12;
    ctx.beginPath(); ctx.arc(hx + ox + fx, hy + oy + fy, this.cell * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - ox + fx, hy - oy + fy, this.cell * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawScanlines(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#000';
    for (let y = 0; y < this.px; y += 3) ctx.fillRect(0, y, this.px, 1);
    ctx.restore();
  }
  drawVignette(ctx) {
    const g = ctx.createRadialGradient(this.px / 2, this.px / 2, this.px * 0.3, this.px / 2, this.px / 2, this.px * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.px, this.px);
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
