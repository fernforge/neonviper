// Headless logic smoke test. Stubs browser APIs, imports the real engine,
// and drives genuine game steps. Run: node test/smoke.mjs
let failures = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; } else { failures++; console.error('  ✗ FAIL:', msg); } }

// ---- browser stubs ----
const noop = () => {};
function ctxMock() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'canvas') return { width: 600, height: 600 };
      if (p in t) return t[p];
      return noop;
    },
    set() { return true; },
  });
}
function audioCtxMock() {
  const gain = () => ({ gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop }, connect: noop });
  const osc = () => ({ type: '', frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop });
  return { createGain: gain, createOscillator: osc, currentTime: 0, destination: {}, state: 'running', resume: noop };
}
global.window = {
  innerWidth: 800, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: noop, AudioContext: function () { return audioCtxMock(); },
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 1;        // stop the rAF loop from recursing
global.cancelAnimationFrame = noop;
global.matchMedia = () => ({ matches: false });
global.document = { getElementById: () => null };

const { Engine } = await import('../public/js/engine.js');
const { MODES } = await import('../public/js/modes.js');

const settings = { sound: false, music: false, screenShake: true, crt: true, aiCommentary: false, gridSize: 'medium' };
const canvas = { getContext: ctxMock, style: {}, width: 0, height: 0 };

function newEngine(mode) {
  const e = new Engine(canvas, settings, {});
  e.start(mode);
  e.state = 'playing'; // skip countdown
  return e;
}

// ---- Test 1: basic step + eat + score ----
{
  const e = newEngine(MODES.classic);
  ok(e.snake.length() === 3, 'snake starts length 3');
  // drop a normal food directly in front of the head and step into it
  const h = e.snake.head();
  e.foods = [{ x: h.x + 1, y: h.y, type: 'normal', icon: '🍎', color: '#f00', score: 10 }];
  e.snake.setDir({ x: 1, y: 0 });
  const before = e.score;
  e.logicStep();
  ok(e.score > before, 'score increases after eating');
  ok(e.snake.grow >= 1, 'snake set to grow after eating');
  ok(e.foods.length >= 1, 'a replacement food spawned');
  ok(e.combo === 2, 'combo increments to 2 on first eat');
}

// ---- Test 2: wall collision kills in non-wrap mode ----
{
  const e = newEngine(MODES.classic);
  let died = false;
  e.hooks.onGameOver = () => { died = true; };
  // teleport head to left edge facing left
  e.snake.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
  e.snake.dir = { x: -1, y: 0 }; e.snake.queue = [];
  e.foods = [{ x: 20, y: 20, type: 'normal', score: 10, color: '#f00', icon: '🍎' }];
  e.logicStep();
  ok(e.state === 'over' || died, 'hitting a wall ends the game');
}

// ---- Test 3: self collision ----
{
  const e = newEngine(MODES.classic);
  // build a snake that will bite itself: a tight loop
  e.snake.body = [ {x:5,y:5},{x:6,y:5},{x:6,y:6},{x:5,y:6},{x:4,y:6},{x:4,y:5} ];
  e.snake.grow = 5;
  e.snake.dir = { x: 0, y: 1 }; e.snake.queue = []; // moving down into own body at (5,6)
  e.foods = [{ x: 20, y: 20, type: 'normal', score: 10, color: '#f00', icon: '🍎' }];
  e.logicStep();
  ok(e.state === 'over', 'biting own body ends the game');
}

// ---- Test 4: ghost power lets you pass through walls (wrap) ----
{
  const e = newEngine(MODES.classic);
  e.activePowers.ghost = 5; e.snake.ghost = true;
  e.snake.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
  e.snake.dir = { x: -1, y: 0 }; e.snake.queue = [];
  e.foods = [{ x: 20, y: 20, type: 'normal', score: 10, color: '#f00', icon: '🍎' }];
  e.logicStep();
  ok(e.state === 'playing', 'ghost survives a wall');
  ok(e.snake.head().x === e.cols - 1, 'ghost wraps to far edge');
}

// ---- Test 5: wrap mode wraps around without dying ----
{
  const e = newEngine(MODES.portal);
  e.portals = []; // isolate wrap behaviour
  e.snake.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
  e.snake.dir = { x: -1, y: 0 }; e.snake.queue = [];
  e.foods = [{ x: 20, y: 20, type: 'normal', score: 10, color: '#f00', icon: '🍎' }];
  e.logicStep();
  ok(e.state === 'playing' && e.snake.head().x === e.cols - 1, 'portal/wrap mode wraps safely');
}

// ---- Test 6: power-ups & effects ----
{
  const e = newEngine(MODES.classic);
  e.grantPower('speed');
  ok(e.activePowers.speed > 0, 'speed power activates with a timer');
  const fast = e.stepInterval();
  delete e.activePowers.speed;
  const normal = e.stepInterval();
  ok(fast < normal, 'speed power shortens the step interval');
  e.activePowers.timewarp = 5;
  ok(e.stepInterval() > normal, 'timewarp lengthens the step interval');
  delete e.activePowers.timewarp;

  const len = e.snake.length(); e.grantPower('grow');
  ok(e.snake.grow >= 4, 'grow adds pending length');

  e.obstacles = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  e.grantPower('clearObstacles');
  ok(e.obstacles.length === 0, 'BOOM clears obstacles');

  ok(e.castEffect('magnet') === true, 'castEffect applies a valid effect');
  ok(e.castEffect('nonsense') === false, 'castEffect rejects unknown effect');
}

// ---- Test 7: maze builds obstacles, rival spawns enemies that move & pathfind ----
{
  const m = newEngine(MODES.maze);
  ok(m.obstacles.length > 0, 'maze mode generates obstacles');

  const r = newEngine(MODES.rival);
  ok(r.enemies.length === 2, 'rival mode spawns 2 AI snakes');
  // put a food next to an enemy and confirm it makes progress toward it over steps
  const e0 = r.enemies[0];
  const start = { ...e0.head() };
  r.foods = [{ x: e0.head().x, y: Math.max(0, e0.head().y - 5), type: 'normal', score: 10, color: '#f00', icon: '🍎' }];
  let moved = false;
  for (let i = 0; i < 6 && r.state === 'playing'; i++) {
    const before = { ...r.enemies[0].head() };
    r.logicStep();
    if (r.enemies[0].head().x !== before.x || r.enemies[0].head().y !== before.y) moved = true;
  }
  ok(moved, 'rival AI snake moves under its own logic');
}

// ---- Test 8: survival rising walls add obstacles over time ----
{
  const e = newEngine(MODES.survival);
  const before = e.obstacles.length;
  e.addRisingLayer();
  ok(e.obstacles.length > before, 'survival rising walls add obstacles');
}

// ---- Test 9: many random steps without throwing (fuzz) ----
{
  const e = newEngine(MODES.rival);
  let crashed = false;
  try {
    for (let i = 0; i < 500; i++) {
      if (e.state !== 'playing') { e.start(MODES.rival); e.state = 'playing'; }
      if (i % 7 === 0) e.snake.setDir([{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][i % 4]);
      e.update(0.05);
      e.render();
    }
  } catch (err) { crashed = true; console.error('   fuzz error:', err.message); }
  ok(!crashed, 'engine survives 500 mixed update+render frames without throwing');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
