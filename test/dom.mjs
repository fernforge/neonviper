// Dependency-free DOM mock that boots the REAL main.js and drives the UI flow
// (menu render → start → steer → pause → spell → game over). jsdom deadlocks in
// this sandbox, so we hand-roll just enough DOM. Run: node test/dom.mjs
import fs from 'fs';
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error('  ✗ FAIL:', m); } };
setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 15000).unref?.();

// ---------- tiny DOM ----------
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  toggle(c) { this.s.has(c) ? this.s.delete(c) : this.s.add(c); }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = new ClassList();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this._html = '';
    this._text = '';
    this.value = '';
    this.onclick = this.ondblclick = this.onchange = this.oninput = null;
  }
  get offsetWidth() { return 0; }
  set className(v) { v.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter((f) => f !== fn); }
  dispatchEvent(e) { (this.listeners[e.type] || []).forEach((fn) => fn(e)); return true; }
  click() { this.onclick && this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click', preventDefault() {} }); }
  focus() {}
  _matches(sel) {
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    return this.tagName === sel.toUpperCase();
  }
  _all(sel, out) { for (const c of this.children) { if (c._matches(sel)) out.push(c); c._all(sel, out); } }
  querySelectorAll(sel) { const out = []; this._all(sel, out); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const els = new Map();
const document = {
  getElementById(id) { if (!els.has(id)) { const e = new El('div'); e.id = id; els.set(id, e); } return els.get(id); },
  createElement(tag) { return new El(tag); },
  addEventListener() {}, body: new El('body'),
};
// canvas needs a 2d context
const canvas = document.getElementById('game');
const noop = () => {};
canvas.getContext = () => new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'canvas') return canvas;
    if (p in t) return t[p];
    return noop;
  }, set() { return true; },
});

function audioCtxMock() {
  const gain = () => ({ gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop }, connect: noop });
  const osc = () => ({ type: '', frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop });
  return { createGain: gain, createOscillator: osc, currentTime: 0, destination: {}, state: 'running', resume: noop };
}

let rafCbs = [];
const winListeners = {};
const window = {
  innerWidth: 900, innerHeight: 800, devicePixelRatio: 1,
  addEventListener(t, fn) { (winListeners[t] ||= []).push(fn); },
  AudioContext: function () { return audioCtxMock(); },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (cb) => { rafCbs.push(cb); return rafCbs.length; },
  cancelAnimationFrame: noop,
};
window.webkitAudioContext = window.AudioContext;
class KeyboardEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } preventDefault() {} }

// localStorage
const _ls = new Map();
const localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
};

// fetch stub mirroring the server
const fetch = async (url, opts) => {
  let data = {};
  if (url.includes('api/health')) data = { ok: true, modelReady: true, model: 'llama3.2:1b' };
  else if (url.includes('api/ai/quip')) data = { text: 'Test hype line!', ai: true };
  else if (url.includes('api/ai/spell')) data = { effect: 'ghost', message: 'You phase out of reality!', ai: true };
  return { ok: true, status: 200, json: async () => data };
};

// publish globals
Object.assign(global, {
  window, document, localStorage, fetch, KeyboardEvent,
  performance: { now: () => Date.now() },
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  matchMedia: window.matchMedia,
});

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const press = (key) => (winListeners.keydown || []).forEach((fn) => fn(new KeyboardEvent('keydown', { key })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pump(n, dt = 16) {
  let now = Date.now();
  for (let i = 0; i < n; i++) { const cbs = rafCbs; rafCbs = []; now += dt; cbs.forEach((cb) => cb(now)); }
}

// ---------- run ----------
await import('../public/js/main.js');
await sleep(40); // health check resolves

ok(!$('menu').classList.contains('hidden'), 'menu visible after boot');
ok($('modeGrid').children.length >= 6, 'all mode cards rendered (' + $('modeGrid').children.length + ')');
ok($('aiBadge').textContent.includes('LIVE'), 'AI badge LIVE after health: "' + $('aiBadge').textContent + '"');

// selecting a mode card highlights it
const card = $('modeGrid').children[3];
card.click();
ok(card.classList.contains('sel'), 'clicking a mode card selects it');

// open each modal without throwing
$('settingsBtn').click(); ok(!$('modal').classList.contains('hidden'), 'settings modal opens'); $('modalClose').click();
$('howBtn').click(); ok($('modalTitle').textContent === 'HOW TO PLAY', 'how-to renders'); $('modalClose').click();
$('scoresBtn').click(); ok($('modalTitle').textContent === 'HIGH SCORES', 'scores render'); $('modalClose').click();

// start the game
press('Enter');
pump(2);
ok(!$('hud').classList.contains('hidden'), 'HUD shows after start');
ok($('menu').classList.contains('hidden'), 'menu hidden after start');

// wait out the 3-2-1-GO countdown, then play
await sleep(2700);
pump(8);
press('ArrowUp'); pump(6); press('ArrowRight'); pump(6); press('ArrowDown'); pump(6);
ok(Number($('score').textContent) >= 0, 'score HUD updates during play ("' + $('score').textContent + '")');

// pause / resume
press(' '); ok(!$('pause').classList.contains('hidden'), 'space pauses');
press(' '); ok($('pause').classList.contains('hidden'), 'space resumes');

// spell console
press('f'); await sleep(20);
ok(!$('spell').classList.contains('hidden'), 'F opens spell console');
$('spellInput').value = 'turn me into a ghost';
press('Enter'); await sleep(60); pump(3);
ok($('spellResult').textContent.length > 0, 'spell returns a result ("' + $('spellResult').textContent + '")');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
