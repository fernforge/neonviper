// Web Audio synth — zero asset files. Procedural blips, music bed, FX.
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let enabled = { sound: true, music: true };
let musicTimer = null;

function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
}

export function initAudio(settings) {
  enabled.sound = settings.sound;
  enabled.music = settings.music;
}
export function resume() { ensure(); if (ctx.state === 'suspended') ctx.resume(); }
export function setEnabled(s) {
  enabled.sound = s.sound; enabled.music = s.music;
  if (!enabled.music) stopMusic();
}

function blip(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
  if (!enabled.sound) return;
  ensure();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

export const sfx = {
  eat(combo = 1) { blip(440 + combo * 60, 0.09, 'square', 0.5, 880 + combo * 80); },
  power() { blip(330, 0.18, 'sawtooth', 0.45, 990); blip(660, 0.2, 'sine', 0.3, 1320); },
  die() { blip(330, 0.5, 'sawtooth', 0.6, 60); },
  turn() { blip(220, 0.03, 'triangle', 0.12); },
  combo() { blip(700, 0.1, 'square', 0.4, 1400); },
  spell() { blip(523, 0.15, 'sine', 0.4, 1568); blip(784, 0.25, 'triangle', 0.3, 2093); },
  fail() { blip(200, 0.25, 'sawtooth', 0.4, 90); },
  click() { blip(600, 0.04, 'square', 0.25); },
  start() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square', 0.4), i * 70)); },
  hiscore() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.45), i * 90)); },
};

// simple arpeggiated music bed
const SCALE = [261.63, 311.13, 349.23, 392.0, 466.16, 523.25];
let step = 0;
export function startMusic() {
  if (!enabled.music) return;
  ensure();
  stopMusic();
  musicTimer = setInterval(() => {
    if (!enabled.music) return;
    const f = SCALE[step % SCALE.length] / 2;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g); g.connect(musicGain);
    o.start(); o.stop(ctx.currentTime + 0.45);
    if (step % 4 === 0) { // bass
      const b = ctx.createOscillator(); const bg = ctx.createGain();
      b.type = 'sine'; b.frequency.value = f / 2;
      bg.gain.setValueAtTime(0.6, ctx.currentTime);
      bg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      b.connect(bg); bg.connect(musicGain);
      b.start(); b.stop(ctx.currentTime + 0.55);
    }
    step++;
  }, 220);
}
export function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
