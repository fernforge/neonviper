// Snake entity. Grid-stepped logic, interpolated rendering for smoothness.
export class Snake {
  constructor(x, y, dir = { x: 1, y: 0 }, color = '#00ffd5', isPlayer = true) {
    this.body = [{ x, y }, { x: x - dir.x, y: y - dir.y }, { x: x - dir.x * 2, y: y - dir.y * 2 }];
    this.prev = this.body.map((c) => ({ ...c }));
    this.dir = { ...dir };
    this.nextDir = { ...dir };
    this.queue = []; // buffered turns
    this.color = color;
    this.isPlayer = isPlayer;
    this.grow = 0;
    this.alive = true;
    this.ghost = false;
  }

  head() { return this.body[0]; }
  length() { return this.body.length; }

  setDir(d) {
    // prevent reversing into yourself; buffer up to 2 turns
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (this.queue.length < 2) this.queue.push(d);
  }

  // advance one grid step. wrap = {cols, rows} or null.
  step(wrap) {
    if (this.queue.length) this.dir = this.queue.shift();
    this.prev = this.body.map((c) => ({ ...c }));
    const h = this.head();
    let nx = h.x + this.dir.x;
    let ny = h.y + this.dir.y;
    if (wrap) {
      nx = (nx + wrap.cols) % wrap.cols;
      ny = (ny + wrap.rows) % wrap.rows;
    }
    this.body.unshift({ x: nx, y: ny });
    if (this.grow > 0) this.grow--;
    else this.body.pop();
  }

  occupies(x, y, includeHead = true) {
    for (let i = includeHead ? 0 : 1; i < this.body.length; i++)
      if (this.body[i].x === x && this.body[i].y === y) return true;
    return false;
  }
  hitsSelf() {
    const h = this.head();
    for (let i = 1; i < this.body.length; i++)
      if (this.body[i].x === h.x && this.body[i].y === h.y) return true;
    return false;
  }

  // interpolated cell position for rendering. t in [0,1] across a step.
  interp(i, t, cell, wrap) {
    const cur = this.body[i];
    const pv = this.prev[Math.min(i, this.prev.length - 1)] || cur;
    let dx = cur.x - pv.x, dy = cur.y - pv.y;
    // avoid long lerp across wrap seam
    if (wrap) {
      if (Math.abs(dx) > 1) dx = 0;
      if (Math.abs(dy) > 1) dy = 0;
    }
    const x = (pv.x + dx * t) * cell;
    const y = (pv.y + dy * t) * cell;
    return { x, y };
  }
}
