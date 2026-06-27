// Bootstrap: menus, input, AI commentary, spell console, persistence.
import { Engine } from './engine.js';
import { MODE_LIST, MODES } from './modes.js';
import * as store from './storage.js';
import * as audio from './audio.js';
import * as ai from './ai.js';
import { POWERUPS } from './powerups.js';
import { updateHud, comboPop, showGM } from './hud.js';

const $ = (id) => document.getElementById(id);
let settings = store.loadSettings();
let selectedMode = MODES.classic;
let engine;
let lastQuipKind = '';

// ---------------- boot ----------------
function boot() {
  audio.initAudio(settings);
  engine = new Engine($('game'), settings, hooks());
  buildModeGrid();
  wireMenu();
  wireGlobalKeys();
  wireDpad();
  if (isTouch()) $('dpad').classList.remove('hidden');
  refreshBest();
  ai.checkHealth().then((h) => setAIBadge(h.modelReady));
  // re-poll health (model may still be pulling)
  setInterval(() => ai.checkHealth().then((h) => setAIBadge(h.modelReady)), 20000);
}

function isTouch() { return matchMedia('(pointer: coarse)').matches; }
function setAIBadge(ready) { $('aiBadge').textContent = 'AI: ' + (ready ? 'LIVE 🤖' : 'offline'); }

function hooks() {
  return {
    countdownEl: $('countdown'),
    best: store.bestScore(),
    onHud: (s) => { updateHud(s); comboPop(s.combo); },
    onStart: () => {
      $('hud').classList.remove('hidden');
      if (settings.music) audio.startMusic();
      gmQuip('start', 'Mode: ' + selectedMode.name);
    },
    onEat: (f, combo, gained) => {
      if (combo === 3) gmQuip('combo', 'combo x3');
      else if (combo >= 6) gmQuip('combo', 'combo x' + combo);
      else if (f.type === 'golden') gmQuip('eat', 'golden star, +' + gained);
    },
    onPower: (key, p) => { gmQuip('powerup', p.name); },
    onPowerEnd: () => {},
    onPause: () => {},
    onGameOver: (r) => endGame(r),
  };
}

// ---------------- menus ----------------
function buildModeGrid() {
  const grid = $('modeGrid');
  grid.innerHTML = '';
  MODE_LIST.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'mode-card' + (m.id === selectedMode.id ? ' sel' : '');
    card.innerHTML = `<div class="mc-ic">${m.icon}</div><div class="mc-name">${m.name}</div><div class="mc-desc">${m.desc}</div>`;
    card.onclick = () => {
      selectedMode = m; audio.resume(); audio.sfx.click();
      [...grid.children].forEach((c) => c.classList.remove('sel'));
      card.classList.add('sel');
    };
    card.ondblclick = () => startGame();
    grid.appendChild(card);
  });
}

function wireMenu() {
  $('howBtn').onclick = () => { audio.sfx.click(); showHow(); };
  $('settingsBtn').onclick = () => { audio.sfx.click(); showSettings(); };
  $('scoresBtn').onclick = () => { audio.sfx.click(); showScores(); };
  $('resumeBtn').onclick = () => { audio.sfx.click(); doResume(); };
  $('quitBtn').onclick = () => { audio.sfx.click(); toMenu(); };
  $('againBtn').onclick = () => { audio.sfx.click(); startGame(); };
  $('menuBtn').onclick = () => { audio.sfx.click(); toMenu(); };
  $('modalClose').onclick = () => { audio.sfx.click(); $('modal').classList.add('hidden'); };
}

function refreshBest() { $('best').textContent = store.bestScore(); }

function startGame() {
  audio.resume();
  hideOverlays();
  engine.hooks.best = store.bestScore(selectedMode.id);
  engine.start(selectedMode);
}

function toMenu() {
  engine.stop();
  audio.stopMusic();
  hideOverlays();
  $('hud').classList.add('hidden');
  $('powerTray').classList.add('hidden');
  $('gm').classList.add('hidden');
  $('menu').classList.remove('hidden');
  refreshBest();
}

function hideOverlays() {
  ['menu', 'pause', 'over', 'modal'].forEach((id) => $(id).classList.add('hidden'));
}

function doResume() { $('pause').classList.add('hidden'); engine.resume(); }
function togglePause() {
  if (engine.state === 'playing') { engine.pause(); $('pause').classList.remove('hidden'); }
  else if (engine.state === 'paused') doResume();
}

// ---------------- game over ----------------
async function endGame(r) {
  const res = store.addScore({ score: r.score, length: r.length, mode: selectedMode.id, date: Date.now() });
  $('overScore').textContent = r.score;
  $('overLen').textContent = r.length;
  $('overBest').textContent = store.bestScore(selectedMode.id);
  $('overTitle').textContent = res.isBest && r.score > 0 ? 'NEW RECORD!' : 'GAME OVER';
  $('overQuip').textContent = '…';
  $('over').classList.remove('hidden');
  if (res.isBest && r.score > 0) audio.sfx.hiscore();

  // AI eulogy
  const kind = res.isBest && r.score > 0 ? 'highscore' : 'death';
  const ctx = `score ${r.score}, length ${r.length}, mode ${selectedMode.name}`;
  const text = settings.aiCommentary ? await ai.quip(kind, ctx, { minGap: 0 }) : null;
  $('overQuip').textContent = text || (kind === 'highscore' ? 'A new legend is born.' : 'Gone but not forgotten.');
}

// ---------------- AI commentary ----------------
async function gmQuip(kind, ctx) {
  if (!settings.aiCommentary) return;
  if (kind === lastQuipKind && kind !== 'combo') return;
  lastQuipKind = kind;
  const text = await ai.quip(kind, ctx);
  if (text && engine.state === 'playing') showGM(text);
}

// ---------------- spell console ----------------
let spellOpen = false;
function openSpell() {
  if (engine.state !== 'playing') return;
  if (engine.spellCharges <= 0) { showGM('No spell charges left! Eat ⭐ to recharge.'); return; }
  spellOpen = true;
  engine.pause();
  $('spell').classList.remove('hidden');
  $('spellResult').textContent = '';
  $('spellResult').className = '';
  const inp = $('spellInput');
  inp.value = '';
  $('spellHint').innerHTML = `Press <b>Enter</b> to cast · <b>Esc</b> to close · ${engine.spellCharges} charge(s) left`;
  setTimeout(() => inp.focus(), 30);
}
function closeSpell() {
  spellOpen = false;
  $('spell').classList.add('hidden');
  if (engine.state === 'paused') engine.resume();
}
async function castSpell() {
  const text = $('spellInput').value.trim();
  if (!text) return;
  $('spellResult').textContent = 'casting…';
  $('spellResult').className = '';
  const res = await ai.castSpell(text);
  if (res.effect && res.effect !== 'none') {
    engine.spellCharges--;
    // resume briefly to apply effect on live snake, then show result
    const wasPaused = engine.state === 'paused';
    if (wasPaused) engine.resume();
    engine.castEffect(res.effect);
    audio.sfx.spell();
    $('spellResult').textContent = '✦ ' + res.message;
    $('spellResult').className = '';
    showGM(res.message);
    setTimeout(() => { spellOpen = false; $('spell').classList.add('hidden'); }, 900);
  } else {
    audio.sfx.fail();
    $('spellResult').textContent = res.message || 'The spell fizzles.';
    $('spellResult').className = 'fail';
  }
}

// ---------------- input ----------------
function wireGlobalKeys() {
  const keymap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (spellOpen) {
      if (e.key === 'Enter') { e.preventDefault(); castSpell(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSpell(); }
      return;
    }
    // menu shortcuts
    if (!$('menu').classList.contains('hidden')) {
      if (e.key === 'Enter') { e.preventDefault(); startGame(); return; }
    }
    if (!$('over').classList.contains('hidden')) {
      if (e.key === 'Enter') { e.preventDefault(); startGame(); return; }
      if (e.key === 'Escape') { e.preventDefault(); toMenu(); return; }
    }
    if (keymap[e.key]) { e.preventDefault(); engine.input(keymap[e.key]); return; }
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openSpell(); }
    else if (e.key === 'Escape') { if (engine.state === 'playing') togglePause(); }
  }, { passive: false });
}

function wireDpad() {
  $('dpad').querySelectorAll('button').forEach((b) => {
    const dir = b.dataset.dir;
    const fire = (e) => { e.preventDefault(); engine.input(dir); };
    b.addEventListener('touchstart', fire, { passive: false });
    b.addEventListener('mousedown', fire);
  });
  // swipe on canvas
  let sx = 0, sy = 0;
  const c = $('game');
  c.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  c.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) engine.input(dx > 0 ? 'right' : 'left');
    else engine.input(dy > 0 ? 'down' : 'up');
  }, { passive: true });
}

// ---------------- modal content ----------------
function showHow() {
  $('modalTitle').textContent = 'HOW TO PLAY';
  $('modalBody').innerHTML = `
    <div class="how-list">
      <p>🎯 Steer with <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Eat to grow & score.</p>
      <p>🔥 <b>Combos:</b> eat quickly to stack a multiplier (up to x9). Don't let the bar empty!</p>
      <p>🎁 <b>Power-ups</b> from gift food: ${Object.values(POWERUPS).map((p) => p.icon).join(' ')} haste, time-warp, ghost, magnet, double & more.</p>
      <p>⭐ <b>Golden</b> = big points. ☠️ <b>Cursed</b> = huge points but forces haste. Risk it.</p>
      <p>✦ <b>Spell Console</b> (<kbd>F</kbd>): type a wish in plain English — the local AI turns it into a real effect. 3 charges per run.</p>
      <p>🌀 Try <b>Portal</b>, 🤖 <b>Rival</b> (AI snakes), 🧱 <b>Maze</b> & 🔥 <b>Survival</b> modes.</p>
      <p>⏸ <kbd>Space</kbd> pause.</p>
    </div>`;
  $('modal').classList.remove('hidden');
}

function showScores() {
  $('modalTitle').textContent = 'HIGH SCORES';
  const scores = store.loadScores();
  if (!scores.length) { $('modalBody').innerHTML = '<p class="desc">No scores yet. Go make history.</p>'; }
  else {
    $('modalBody').innerHTML = '<ul class="sc-list">' + scores.slice(0, 12).map((s, i) =>
      `<li><span class="rank">#${i + 1}</span><span class="sc-mode">${(MODES[s.mode] || {}).name || s.mode}</span><span class="sc-val">${s.score}</span></li>`
    ).join('') + '</ul>';
  }
  $('modal').classList.remove('hidden');
}

function showSettings() {
  $('modalTitle').textContent = 'SETTINGS';
  const toggles = [
    ['sound', 'Sound FX', 'Procedural blips & zaps'],
    ['music', 'Music', 'Synth arcade bed'],
    ['screenShake', 'Screen shake', 'Impact feedback'],
    ['crt', 'CRT scanlines', 'Retro overlay'],
    ['aiCommentary', 'AI Game Master', 'Live local-LLM hype'],
  ];
  const sizes = ['small', 'medium', 'large'];
  $('modalBody').innerHTML =
    toggles.map(([k, label, desc]) =>
      `<div class="row"><div><label>${label}</label><div class="desc">${desc}</div></div>
       <div class="switch ${settings[k] ? 'on' : ''}" data-k="${k}"></div></div>`).join('') +
    `<div class="row"><div><label>Grid size</label><div class="desc">Board dimensions</div></div>
       <div><select id="gridSel">${sizes.map((s) => `<option value="${s}" ${settings.gridSize === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>`;
  $('modalBody').querySelectorAll('.switch').forEach((sw) => {
    sw.onclick = () => {
      const k = sw.dataset.k; settings[k] = !settings[k]; sw.classList.toggle('on');
      store.saveSettings(settings); applySettings(); audio.sfx.click();
    };
  });
  $('gridSel').onchange = (e) => { settings.gridSize = e.target.value; store.saveSettings(settings); engine.layout(); };
  $('modal').classList.remove('hidden');
}

function applySettings() {
  audio.setEnabled(settings);
  engine.shake.enabled = settings.screenShake;
  engine.settings = settings;
  if (settings.music && engine.state === 'playing') audio.startMusic();
  if (!settings.music) audio.stopMusic();
}

boot();
