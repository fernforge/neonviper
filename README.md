# 🐍 NEONVIPER

> The most amped-up Snake you've ever played — neon juice, power-ups, AI rival
> snakes, six game modes, and a **local-LLM Game Master** that taunts you in real
> time plus a **natural-language Spell Console** that turns your wishes into
> real in-game effects.

### ▶ [Play it live on GitHub Pages](https://fernforge.github.io/neonviper/)

Built with **zero dependencies** — a tiny Node HTTP server (`server.cjs`) serves a
vanilla HTML5 Canvas game and proxies a local [Ollama](https://ollama.com) model
for the AI features. If no model is present, every AI feature degrades gracefully
to hand-written fallbacks, so the game is always fully playable.

> **About the live demo:** GitHub Pages is static-only, so the hosted version runs
> the game **fully client-side** — all six modes, every power-up, juice, and the
> Spell Console (via a built-in offline keyword parser) work. The *model-generated*
> AI Game Master quips and LLM-powered spell parsing only light up when you run the
> Node server locally against an Ollama model (see below); the badge shows
> `AI: LIVE 🤖` when that's active and `AI: offline` on the static demo.

## Run it

```bash
npm start            # → http://localhost:3000   (node server.cjs)
```

Optional (for the live AI Game Master + smartest Spell Console):

```bash
ollama pull llama3.2:1b     # a small CPU-friendly model; warmed automatically
```

The server auto-detects the model, warms it on boot, and falls back to canned
lines if Ollama isn't running.

## Controls

| Key | Action |
| --- | --- |
| `↑ ↓ ← →` / `WASD` | steer |
| `Space` | pause / resume |
| `F` | open the **Spell Console** (3 charges per run) |
| `Enter` | start / play again |
| swipe / on-screen D-pad | mobile controls |

## Features

- **6 game modes**
  - 🐍 **Classic** — pure neon snake with power-ups & combos
  - 🧱 **Maze** — procedurally generated obstacle fields
  - 🌀 **Portal** — wrap-around walls + teleport gates
  - 🤖 **Rival** — BFS-pathfinding AI snakes hunt the same food
  - 🔥 **Survival** — walls close in over time
  - 🧘 **Zen** — no edge death, just vibes
- **Power-ups** — ⚡ haste, 🕒 time-warp, 👻 ghost (phase through walls), 🧲 magnet,
  ✖️ score-double, 🪶 shrink, 🍔 grow, 💥 obstacle-clear.
- **Special food** — ⭐ golden (big points), 🎁 gift (random power), ☠️ cursed (huge
  points but forces haste).
- **Combo system** — chain quick eats for up to a x9 multiplier.
- **🤖 AI Game Master (Ollama)** — live, context-aware hype and death eulogies.
- **✦ Spell Console (Ollama)** — type a wish in plain English ("freeze time",
  "make me a ghost", "double my points") and a local LLM maps it to a real game
  effect. Robust offline keyword parser as fallback.
- **Juice** — particle bursts, screen shake, CRT scanlines, synthesized Web-Audio
  SFX & a music bed (no asset files), smooth interpolated rendering.
- **Persistence** — high scores & settings saved to `localStorage`.

## Architecture

```
server.cjs            Node HTTP static server + Ollama proxy
                      (/api/ai/quip, /api/ai/spell, /api/health) with fallbacks
public/index.html     game shell + UI overlays
public/css/style.css  neon styling
public/js/
  main.js       bootstrap, menus, input, AI wiring, spell console
  engine.js     game loop, rules, collisions, rendering, all the juice
  snake.js      snake entity (grid logic + interpolated rendering)
  enemy.js      AI rival snake (BFS pathfinding + self-trap avoidance)
  modes.js      mode definitions
  powerups.js   power-up & food-type tables
  particles.js  particle system + screen shake
  audio.js      Web-Audio synth SFX + music
  ai.js         AI client: uses the server's Ollama endpoints when present,
                else falls back to fully client-side quips + offline spell parser
                (this is what makes the static GitHub Pages build self-contained)
  storage.js    localStorage settings + high scores
  hud.js        HUD / power-up tray / Game Master speech rendering
```

## Tests

```bash
npm test
```

- `test/smoke.mjs` — headless logic harness: stubs the browser APIs, imports the
  real `engine.js`, and drives genuine game steps (eating, scoring, combos, wall
  & self collisions, ghost/wrap, power-ups, portals, enemy AI, survival walls,
  plus a 500-frame fuzz). **22 assertions.**
- `test/dom.mjs` — dependency-free DOM mock that boots the real `main.js` and
  drives the full UI flow (menu → mode select → modals → start → countdown →
  play → pause → Spell Console). **14 assertions.**

(36 assertions total, all passing. A real headless browser was unavailable in the
build sandbox — Chromium's system libs can't be installed without root and jsdom
deadlocks there — so the mock harnesses exercise the real game code directly.)
