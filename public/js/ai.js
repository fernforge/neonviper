// Client for the AI features. Talks to the Node server's Ollama-backed endpoints
// when one is present (npm start), and falls back to fully client-side logic when
// served as a static site (e.g. GitHub Pages) so quips + the Spell Console always work.
let modelReady = false;     // true only when a live Ollama model answered
let serverPresent = null;   // null=unknown, true/false once probed
let lastQuipAt = 0;

// ----- client-side canned content (mirrors server fallbacks) ------------------
const QUIPS = {
  start: ['Slither or be slithered.', 'Eyes on the pixels, viper.', "Let's cause some chaos."],
  eat: ['Nom.', 'Tasty bytes.', 'Growing strong.', 'More! More!'],
  combo: ['COMBO! Unstoppable.', 'On fire and loving it.', 'Style points awarded.'],
  powerup: ['Power surge!', 'Ooh, shiny.', 'Now we cheat... legally.'],
  death: ['Oof. Walls win again.', "That's a paddlin'.", 'Reincarnate and try harder.', 'The tail giveth, the tail taketh.'],
  highscore: ['NEW RECORD. Bow down.', 'History rewritten.', 'Legends are made tonight.'],
};
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// crude offline spell parser so the Spell Console always does *something*
function offlineSpell(text) {
  const t = (text || '').toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  if (has('freeze', 'stop time', 'time stop', 'pause world')) return { effect: 'timewarp', message: 'Time crawls to a halt.' };
  if (has('slow')) return { effect: 'timewarp', message: 'Everything slooows down.' };
  if (has('ghost', 'phase', 'through wall', 'intangible', 'noclip')) return { effect: 'ghost', message: 'You phase out of reality.' };
  if (has('tiny', 'small', 'shrink', 'smaller')) return { effect: 'shrink', message: 'You shrink to a sliver.' };
  if (has('magnet', 'attract', 'pull')) return { effect: 'magnet', message: 'Food bends toward you.' };
  if (has('rich', 'double', 'multiply', 'points', 'score')) return { effect: 'multiplier', message: 'Score doubles. Greedy.' };
  if (has('grow', 'big', 'huge', 'long')) return { effect: 'grow', message: 'You surge in length.' };
  if (has('boom', 'bomb', 'explode', 'clear', 'nuke')) return { effect: 'clearObstacles', message: 'Obstacles obliterated.' };
  if (has('speed', 'fast', 'rush', 'haste')) return { effect: 'speed', message: 'You blur into hyperspeed.' };
  return { effect: 'none', message: 'The magic fizzles... try another wish.' };
}

// ----- health -----------------------------------------------------------------
export async function checkHealth() {
  try {
    const r = await fetch('api/health');
    if (!r.ok) throw new Error('no server');
    const j = await r.json();
    serverPresent = true;
    modelReady = !!j.modelReady;
    return j;
  } catch {
    serverPresent = false;
    modelReady = false;
    return { ok: false, modelReady: false, offline: true };
  }
}
// True when a live LLM is answering. The "AI" badge reflects this; the static
// build still has snappy canned commentary, just not model-generated.
export function isAI() { return modelReady; }
export function isOffline() { return serverPresent === false; }

// ----- quips (throttled, never block gameplay) --------------------------------
export async function quip(kind, context = '', { minGap = 2500 } = {}) {
  const now = performance.now();
  if (now - lastQuipAt < minGap && kind !== 'death' && kind !== 'highscore') return null;
  lastQuipAt = now;
  const fallback = pick(QUIPS[kind] || QUIPS.eat);
  if (serverPresent === false) return fallback; // static build: canned line
  try {
    const r = await fetch('api/ai/quip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, context }),
    });
    if (!r.ok) throw new Error('no server');
    const j = await r.json();
    serverPresent = true;
    modelReady = j.ai || modelReady;
    return j.text || fallback;
  } catch {
    serverPresent = false;
    return fallback;
  }
}

// ----- spell console ----------------------------------------------------------
export async function castSpell(text) {
  const off = offlineSpell(text);
  if (serverPresent === false) return { ...off, ai: false }; // static build
  try {
    const r = await fetch('api/ai/spell', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error('no server');
    const j = await r.json();
    serverPresent = true;
    return j; // { effect, message, ai }
  } catch {
    serverPresent = false;
    return { ...off, ai: false };
  }
}
