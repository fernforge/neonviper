'use strict';
/**
 * NEONVIPER server
 * - Serves static files from ./public
 * - Proxies a couple of tiny endpoints to a local Ollama server, with graceful
 *   canned fallbacks so the game is fully playable even with no model present.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// ----- canned fallbacks (used when Ollama is unreachable / no model) ----------
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

// ----- ollama helpers ---------------------------------------------------------
function ollamaGenerate(prompt, { json = false, num_predict = 60, timeout = 14000 } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      keep_alive: '30m', // keep model hot so latency stays ~3-4s, not 30s
      format: json ? 'json' : undefined,
      options: { temperature: 0.9, num_predict, num_ctx: 1024 },
    });
    const u = new URL('/api/generate', OLLAMA);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data).response || ''); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('ollama timeout')));
    req.write(body);
    req.end();
  });
}

let MODEL_READY = null; // cache
async function modelAvailable() {
  if (MODEL_READY !== null) return MODEL_READY;
  try {
    const tags = await new Promise((resolve, reject) => {
      const u = new URL('/api/tags', OLLAMA);
      http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (res) => {
        let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject).setTimeout(2000, function () { this.destroy(new Error('t')); });
    });
    MODEL_READY = (tags.models || []).some((m) => m.name && m.name.startsWith(MODEL.split(':')[0]));
  } catch { MODEL_READY = false; }
  // re-check periodically (model may finish pulling)
  setTimeout(() => { MODEL_READY = null; }, 15000);
  return MODEL_READY;
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

// ----- AI endpoints -----------------------------------------------------------
async function handleQuip(req, res) {
  const { kind = 'eat', context = '' } = await readBody(req);
  const fallback = pick(QUIPS[kind] || QUIPS.eat);
  if (!(await modelAvailable())) return send(res, 200, MIME['.json'], JSON.stringify({ text: fallback, ai: false }));
  const prompt =
    `You are the snarky, hype AI Game Master of a neon arcade Snake game called NEONVIPER. ` +
    `Event: "${kind}". ${context ? 'Context: ' + context + '. ' : ''}` +
    `Reply with ONE short punchy line (max 8 words), no quotes, no emoji.`;
  try {
    let text = (await ollamaGenerate(prompt, { num_predict: 24, timeout: 12000 })).trim().split('\n')[0].replace(/^["']|["']$/g, '');
    if (!text || text.length > 80) text = fallback;
    send(res, 200, MIME['.json'], JSON.stringify({ text, ai: true }));
  } catch {
    send(res, 200, MIME['.json'], JSON.stringify({ text: fallback, ai: false }));
  }
}

async function handleSpell(req, res) {
  const { text = '' } = await readBody(req);
  const off = offlineSpell(text);
  if (!(await modelAvailable())) return send(res, 200, MIME['.json'], JSON.stringify({ ...off, ai: false }));
  const prompt =
    `You map a player's spoken wish in a Snake game to ONE game effect. ` +
    `Allowed effects: speed, timewarp(slow/freeze time), ghost(pass through walls), shrink, ` +
    `magnet(pull food), multiplier(double score), grow, clearObstacles, none. ` +
    `Wish: "${String(text).slice(0, 120)}". ` +
    `Respond as JSON: {"effect":"<one>","message":"<vivid 6-word cast line>"}.`;
  try {
    const raw = await ollamaGenerate(prompt, { json: true, num_predict: 60, timeout: 15000 });
    const parsed = JSON.parse(raw);
    const allowed = ['speed', 'timewarp', 'ghost', 'shrink', 'magnet', 'multiplier', 'grow', 'clearObstacles', 'none'];
    const effect = allowed.includes(parsed.effect) ? parsed.effect : off.effect;
    const message = (parsed.message && String(parsed.message).slice(0, 80)) || off.message;
    send(res, 200, MIME['.json'], JSON.stringify({ effect, message, ai: true }));
  } catch {
    send(res, 200, MIME['.json'], JSON.stringify({ ...off, ai: false }));
  }
}

async function handleHealth(req, res) {
  send(res, 200, MIME['.json'], JSON.stringify({ ok: true, model: MODEL, modelReady: await modelAvailable() }));
}

// ----- static -----------------------------------------------------------------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC)) return send(res, 403, 'text/plain', 'forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'text/plain', 'not found');
    send(res, 200, MIME[path.extname(filePath)] || 'application/octet-stream', data);
  });
}

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/ai/quip' && req.method === 'POST') return handleQuip(req, res);
  if (u === '/api/ai/spell' && req.method === 'POST') return handleSpell(req, res);
  if (u === '/api/health') return handleHealth(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`NEONVIPER running at http://localhost:${PORT}  (ollama model: ${MODEL})`);
  // Warm the model in the background so the first real request isn't a 30s cold load.
  modelAvailable().then((ok) => {
    if (!ok) return console.log('  ollama model not found — AI features use canned fallbacks.');
    ollamaGenerate('hi', { num_predict: 1, timeout: 60000 })
      .then(() => console.log('  ollama model warmed & ready 🔥'))
      .catch(() => console.log('  ollama warmup failed — will retry on demand.'));
  });
});
