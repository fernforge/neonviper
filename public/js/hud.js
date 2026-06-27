// HUD rendering: score, combo, mode, active power-up tray.
import { POWERUPS } from './powerups.js';

const $ = (id) => document.getElementById(id);

export function updateHud(s) {
  $('score').textContent = s.score;
  $('best').textContent = s.best;
  $('length').textContent = s.length;
  $('modeName').textContent = s.mode;

  const comboEl = $('combo');
  if (s.combo > 1) {
    comboEl.classList.remove('hidden');
    $('comboMult').textContent = s.combo;
    $('comboBarFill').style.width = Math.max(0, (s.comboTimer / 3) * 100) + '%';
  } else {
    comboEl.classList.add('hidden');
    $('comboBarFill').style.width = '0%';
  }
  renderPowerTray(s.powers);
}

let lastCombo = 1;
export function comboPop(combo) {
  if (combo > lastCombo) {
    const el = $('combo');
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 110);
  }
  lastCombo = combo;
}

function renderPowerTray(powers) {
  const tray = $('powerTray');
  const keys = Object.keys(powers);
  if (!keys.length) { tray.classList.add('hidden'); tray.innerHTML = ''; return; }
  tray.classList.remove('hidden');
  tray.innerHTML = keys.map((k) => {
    const p = POWERUPS[k]; if (!p) return '';
    const pct = Math.max(0, Math.min(100, (powers[k] / p.dur) * 100));
    return `<div class="pchip"><span class="ic">${p.icon}</span><span>${p.name}</span>
      <span class="pbar"><div style="width:${pct}%;background:${p.color}"></div></span></div>`;
  }).join('');
}

export function showGM(text) {
  const el = $('gm');
  el.classList.remove('hidden');
  $('gmText').textContent = text;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3600);
}
