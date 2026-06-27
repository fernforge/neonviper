# NEONVIPER — Amped-up Snake  ✅ COMPLETE

## Goal
Most over-the-top Snake game possible, with innovative features + local LLM
(Ollama) integration. Browser HTML5 Canvas, tiny Node server proxies Ollama with
graceful canned fallbacks. ZERO npm dependencies.

## How to run
- `npm start`  → `node server.cjs` → http://localhost:3000
- `npm test`   → smoke.mjs (22 logic asserts) + dom.mjs (14 UI asserts), all pass
- Ollama at 127.0.0.1:11434, model `llama3.2:1b` (already pulled, shared cache).
  Server warms it on boot (`keep_alive: 30m`). AI features fall back to canned
  lines / an offline keyword spell-parser if the model is absent or slow.

## Status — DONE
- [x] Brainstorm + plan
- [x] server.cjs — static serving + /api/ai/quip, /api/ai/spell, /api/health, warmup
- [x] engine: loop, grid steps w/ interpolation, collisions, scoring, combos
- [x] snake.js, enemy.js (BFS AI), particles.js, audio.js (Web-Audio synth)
- [x] powerups + special foods (golden/gift/cursed)
- [x] 6 modes: classic, maze, portal, rival, survival, zen
- [x] AI Game Master (live quips) + Spell Console (NL → effect)
- [x] HUD, menus, settings, high scores, persistence (localStorage)
- [x] tests: smoke.mjs + dom.mjs (36 asserts, all green)
- [x] README.md
- [x] server.cjs running live, AI verified working (quip ai:true)

## Key decisions / gotchas (for any future resume)
- Server file is `server.cjs` (CommonJS) because package.json is `type:module`
  (so public/js/*.js are clean ESM in the browser). `npm start` runs it.
- NO real browser in sandbox: Chromium needs system libs (no sudo to apt-get),
  and **jsdom DEADLOCKS on import here** (hangs >70s). So `test/dom.mjs` uses a
  hand-rolled DOM mock instead — do NOT reintroduce jsdom/puppeteer.
- Ollama is CPU-only: cold load ~31s, warm gen ~3-4s. Hence boot warmup +
  long-ish timeouts (quip 12s, spell 15s) + keep_alive. Spell uses format:json;
  if the 1b model is slow/returns bad JSON it falls back to the offline parser
  (which is actually very reliable for common wishes) — `ai:false` then.
- If port 3000 is taken by a stale process, find it via `/proc/*/cmdline`
  (ps may not see it in this PID namespace) and `kill -9`.

## If anything is left
Nothing required. Possible future polish: a richer music sequencer, more spell
effects, online leaderboard, sprite skins. All optional.
