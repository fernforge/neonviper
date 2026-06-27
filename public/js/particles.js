// Lightweight particle system + floating score text + screen shake.
export class Particles {
  constructor() { this.list = []; this.texts = []; }

  burst(x, y, color, count = 14, opts = {}) {
    const speed = opts.speed || 3;
    const life = opts.life || 0.6;
    const size = opts.size || 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random()) * speed;
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, color, size: size * (0.5 + Math.random()),
      });
    }
  }
  ring(x, y, color, radius = 30) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.list.push({
        x, y, vx: Math.cos(a) * radius * 0.08, vy: Math.sin(a) * radius * 0.08,
        life: 0.5, max: 0.5, color, size: 2.5,
      });
    }
  }
  text(x, y, str, color = '#ffe600') {
    this.texts.push({ x, y, str, color, life: 1, max: 1, vy: -0.6 });
  }

  update(dt) {
    for (const p of this.list) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.vy += 0.05;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y += t.vy; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx) {
    ctx.save();
    for (const p of this.list) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const t of this.texts) {
      const a = Math.max(0, t.life / t.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = '700 20px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}

export class Shake {
  constructor() { this.t = 0; this.mag = 0; this.enabled = true; }
  add(mag, dur = 0.3) { if (!this.enabled) return; this.mag = Math.max(this.mag, mag); this.t = Math.max(this.t, dur); this.dur = dur; }
  update(dt) { if (this.t > 0) this.t -= dt; if (this.t <= 0) this.mag = 0; }
  offset() {
    if (this.t <= 0) return { x: 0, y: 0 };
    const m = this.mag * (this.t / (this.dur || 0.3));
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }
}
