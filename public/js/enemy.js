// AI rival snake: BFS toward nearest food, avoiding bodies/obstacles/walls,
// with a safety check so it doesn't trap itself instantly.
import { Snake } from './snake.js';

const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export class Enemy extends Snake {
  constructor(x, y, color, cols, rows) {
    super(x, y, { x: -1, y: 0 }, color, false);
    this.cols = cols; this.rows = rows;
  }

  // build a blocked-set from obstacles + all snake bodies (excluding our own head)
  think(foods, obstacles, otherSnakes, wrap) {
    const blocked = new Set();
    for (const o of obstacles) blocked.add(o.x + ',' + o.y);
    for (const s of otherSnakes) {
      const body = s === this ? s.body.slice(1) : s.body;
      for (const c of body) blocked.add(c.x + ',' + c.y);
    }
    const h = this.head();
    // target nearest food
    let target = null, bestD = Infinity;
    for (const f of foods) {
      const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
      if (d < bestD) { bestD = d; target = f; }
    }
    let move = null;
    if (target) move = this.bfs(h, target, blocked, wrap);
    if (!move) move = this.safeFallback(h, blocked, wrap);
    if (move) this.setDir(move);
  }

  inb(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

  bfs(start, goal, blocked, wrap) {
    const key = (x, y) => x + ',' + y;
    const q = [[start.x, start.y]];
    const came = new Map();
    came.set(key(start.x, start.y), null);
    let found = false;
    let steps = 0;
    while (q.length && steps < 1200) {
      steps++;
      const [cx, cy] = q.shift();
      if (cx === goal.x && cy === goal.y) { found = true; break; }
      for (const d of DIRS) {
        let nx = cx + d.x, ny = cy + d.y;
        if (wrap) { nx = (nx + this.cols) % this.cols; ny = (ny + this.rows) % this.rows; }
        if (!wrap && !this.inb(nx, ny)) continue;
        const k = key(nx, ny);
        if (blocked.has(k) && !(nx === goal.x && ny === goal.y)) continue;
        if (came.has(k)) continue;
        came.set(k, [cx, cy]);
        q.push([nx, ny]);
      }
    }
    if (!found) return null;
    // reconstruct first step from start
    let cur = key(goal.x, goal.y);
    let prev = came.get(cur);
    if (prev === undefined) return null;
    while (prev && key(prev[0], prev[1]) !== key(start.x, start.y)) {
      cur = key(prev[0], prev[1]);
      prev = came.get(cur);
    }
    const [tx, ty] = cur.split(',').map(Number);
    let dx = tx - start.x, dy = ty - start.y;
    if (wrap) { // normalize wrap step to unit
      if (dx > 1) dx = -1; if (dx < -1) dx = 1;
      if (dy > 1) dy = -1; if (dy < -1) dy = 1;
    }
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    return { x: dx, y: dy };
  }

  safeFallback(h, blocked, wrap) {
    const opts = DIRS.filter((d) => {
      if (d.x === -this.dir.x && d.y === -this.dir.y) return false;
      let nx = h.x + d.x, ny = h.y + d.y;
      if (wrap) { nx = (nx + this.cols) % this.cols; ny = (ny + this.rows) % this.rows; }
      if (!wrap && !this.inb(nx, ny)) return false;
      return !blocked.has(nx + ',' + ny);
    });
    if (!opts.length) return null;
    // prefer keeping current direction
    const keep = opts.find((d) => d.x === this.dir.x && d.y === this.dir.y);
    return keep || opts[Math.floor(Math.random() * opts.length)];
  }
}
