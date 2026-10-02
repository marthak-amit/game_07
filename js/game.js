// Bloom Chain — canvas renderer, input and animation director.
import { COLS, ROWS, N, EMPTY, ORB, STONE, MIR_A, MIR_B, cloneBoard, orbCount, resolveTap, solve } from './engine.js';
import { sfx, haptic } from './audio.js';
import { state } from './storage.js';

export const SKINS = {
  neon: { name: 'Neon', price: 0, cols: ['#3be8ff', '#ffd23f', '#ff4d8d'] },
  candy: { name: 'Candy', price: 250, cols: ['#7cf5c1', '#ffb347', '#ff6fb5'] },
  ember: { name: 'Ember', price: 500, cols: ['#ffd36e', '#ff8a3d', '#ff3d3d'] },
  aurora: { name: 'Aurora', price: 800, cols: ['#9b8cff', '#4df0c4', '#ff7ad9'] },
};

export const WORLDS = [
  { name: 'Neon Meadow', hue: 262 }, { name: 'Crystal Cave', hue: 200 }, { name: 'Sunset Dunes', hue: 18 },
  { name: 'Frost Garden', hue: 185 }, { name: 'Lava Bloom', hue: 350 }, { name: 'Deep Ocean', hue: 225 },
  { name: 'Cosmic Orchard', hue: 300 }, { name: 'Golden Hour', hue: 40 },
];
export const worldOf = (n) => WORLDS[Math.floor((n - 1) / 12) % WORLDS.length];

const PRAISE = [[3, 'Nice!'], [6, 'Great!'], [9, 'Awesome!'], [13, 'Incredible!'], [18, 'UNREAL!']];
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.mode = 'menu';
    this.board = null; this.sim = null;
    this.phase = 'idle'; // idle | anim | over
    this.parts = []; this.rings = []; this.shards = []; this.texts = []; this.timeline = [];
    this.bounce = new Float32Array(N);
    this.clock = 0; this.time = 0; this.shake = 0; this.flash = 0;
    this.hintIdx = -1; this.undoStack = []; this.burstCol = {};
    this.menuOrbs = Array.from({ length: 14 }, () => this.newMenuOrb(true));
    this.sprites = new Map();
    this.cb = {};
    this.world = WORLDS[0];
    this.top = 120; this.bottom = 130;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  get cols() { return SKINS[state.skin] ? SKINS[state.skin].cols : SKINS.neon.cols; }

  newMenuOrb(init) {
    return { x: Math.random(), y: init ? Math.random() : 1.1, v: 1 + Math.floor(Math.random() * 3), s: rand(0.02, 0.06), r: rand(10, 26), ph: Math.random() * 6 };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.layout();
    this.sprites.clear();
  }

  setInsets(top, bottom) { this.top = top; this.bottom = bottom; this.layout(); }

  layout() {
    const availH = this.H - this.top - this.bottom;
    this.cs = Math.max(20, Math.min((this.W - 20) / COLS, availH / ROWS, 92));
    this.ox = (this.W - this.cs * COLS) / 2;
    this.oy = this.top + (availH - this.cs * ROWS) / 2;
  }

  // ---------- level lifecycle ----------

  load(spec, world) {
    this.mode = 'play';
    this.world = world || WORLDS[0];
    this.spec = spec;
    this.sim = cloneBoard(spec.board);
    this.board = cloneBoard(spec.board);
    this.tapsLeft = spec.limit; this.used = 0; this.maxCombo = 0; this.bursts = 0;
    this.phase = 'idle'; this.timeline = []; this.shards = []; this.parts = []; this.rings = []; this.texts = [];
    this.undoStack = []; this.hintIdx = -1; this.bounce.fill(0);
    this.cb.onTaps && this.cb.onTaps(this.tapsLeft);
    this.cb.onMoves && this.cb.onMoves(this.used);
  }

  setMenu() { this.mode = 'menu'; this.phase = 'idle'; this.hintIdx = -1; }

  addTaps(n) {
    this.tapsLeft += n;
    if (this.phase === 'over') this.phase = 'idle';
    this.cb.onTaps && this.cb.onTaps(this.tapsLeft);
  }

  canUndo() { return this.mode === 'play' && this.phase === 'idle' && this.undoStack.length > 0; }

  undo() {
    if (!this.canUndo()) return false;
    const s = this.undoStack.pop();
    this.sim = cloneBoard(s.board); this.board = cloneBoard(s.board);
    this.tapsLeft = s.tapsLeft; this.used = s.used; this.hintIdx = -1;
    this.cb.onTaps && this.cb.onTaps(this.tapsLeft);
    this.cb.onMoves && this.cb.onMoves(this.used);
    sfx.click();
    return true;
  }

  hint() {
    if (this.mode !== 'play' || this.phase !== 'idle') return false;
    const r = solve(this.sim, Math.max(1, Math.min(7, this.tapsLeft)), 30);
    if (!r.path.length) return false;
    this.hintIdx = r.path[0];
    return true;
  }

  // ---------- input ----------

  cellAt(px, py) {
    const gx = (px - this.ox) / this.cs, gy = (py - this.oy) / this.cs;
    // forgiving: pick the nearest orb within 0.7 of a cell
    let best = -1, bd = 0.7;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.sim.T[y * COLS + x] !== ORB) continue;
        const d = Math.hypot(gx - (x + 0.5), gy - (y + 0.5));
        if (d < bd) { bd = d; best = y * COLS + x; }
      }
    }
    return best;
  }

  onPointer(e) {
    sfx.unlock();
    if (this.mode !== 'play' || this.phase !== 'idle') return;
    const r = this.cv.getBoundingClientRect();
    const idx = this.cellAt(e.clientX - r.left, e.clientY - r.top);
    if (idx < 0) { return; }
    this.tap(idx);
  }

  tap(idx) {
    if (this.tapsLeft <= 0) { this.cb.onLose && this.cb.onLose(); return; }
    this.undoStack.push({ board: cloneBoard(this.sim), tapsLeft: this.tapsLeft, used: this.used });
    if (this.undoStack.length > 1) this.undoStack.shift();
    this.hintIdx = -1;
    const log = [];
    const res = resolveTap(this.sim, idx, log);
    if (!res.ok) { this.undoStack.pop(); return; }
    this.tapsLeft--; this.used++;
    this.cb.onTaps && this.cb.onTaps(this.tapsLeft);
    this.cb.onMoves && this.cb.onMoves(this.used);
    this.phase = 'anim';
    this.combo = 0; this.praised = 0;
    this.playLog(log, res);
  }

  // ---------- animation director ----------

  at(t, fn) { this.timeline.push({ t: this.clock + t, fn }); }

  cellPx(i) { return [this.ox + ((i % COLS) + 0.5) * this.cs, this.oy + (((i / COLS) | 0) + 0.5) * this.cs]; }
  ptPx(x, y) { return [this.ox + (x + 0.5) * this.cs, this.oy + (y + 0.5) * this.cs]; }

  playLog(log, res) {
    let t = 0;
    const T = this.board.T, V = this.board.V;
    for (const step of log) {
      if (step.type === 'tap') {
        const idx = step.idx, v = step.v;
        this.at(t, () => {
          V[idx] = v; this.bounce[idx] = 1; sfx.tap(); haptic(8);
          const [x, y] = this.cellPx(idx);
          this.ring(x, y, this.cs * 0.5, this.cols[Math.min(2, v - 1)], 0.3);
        });
        t += 0.11;
        continue;
      }
      const wt = t;
      for (const b of step.bursts) this.at(wt, () => this.burstFx(b));
      t += 0.05;
      let maxEnd = t + 0.12;
      for (const sh of step.shards) {
        const pts = sh.pts.map(([x, y]) => this.ptPx(x, y));
        let len = 0;
        for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        const dur = Math.max(0.1, len / (this.cs * 13));
        const end = sh.end, arrive = t + dur, from = sh.from;
        let col = this.cols[2];
        this.at(t, () => { col = this.burstCol[from] || col; this.shards.push({ pts, len, t0: this.clock, dur, col }); });
        maxEnd = Math.max(maxEnd, arrive);
        this.at(arrive, () => this.hitFx(end, pts[pts.length - 1], col));
      }
      t = maxEnd + 0.05;
    }
    this.at(t + 0.05, () => this.finishTap(res));
  }

  burstFx(i) {
    const T = this.board.T, V = this.board.V;
    const [x, y] = this.cellPx(i);
    T[i] = EMPTY; V[i] = 0;
    this.combo++; this.bursts++;
    const col = this.cols[(this.combo + 1) % 3];
    this.burstCol[i] = col;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    sfx.pop(this.combo - 1); haptic(this.combo > 5 ? 18 : 10);
    this.ring(x, y, this.cs * 1.1, col, 0.45);
    this.ring(x, y, this.cs * 0.6, '#ffffff', 0.25);
    const n = Math.min(26, 12 + this.combo);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, sp = rand(this.cs * 1.2, this.cs * 4.2);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 0.8), max: 0.8, size: rand(2, 4.6), col });
    }
    this.shake = Math.min(14, this.shake + 2 + this.combo * 0.45);
    if (this.combo >= 3) this.floatText(`x${this.combo}`, x, y - this.cs * 0.2, col, 16 + Math.min(22, this.combo * 1.6));
    for (const [need, word] of PRAISE) {
      if (this.combo >= need && this.praised < need) {
        this.praised = need;
        this.floatText(word, this.W / 2, this.oy + this.cs * 1.2, '#ffffff', 38, 1.1);
      }
    }
  }

  hitFx(end, p, col) {
    if (!p) return;
    const [x, y] = p;
    if (end.kind === 'orb') {
      const i = end.idx;
      this.board.V[i] = Math.min(3, end.v);
      this.bounce[i] = 1;
      sfx.charge(end.v);
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * 6.283, sp = rand(this.cs * 0.8, this.cs * 2);
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3, max: 0.3, size: 2.5, col });
      }
    } else if (end.kind === 'stone') {
      const i = end.idx;
      this.bounce[i] = 1; sfx.stone(); haptic(14);
      if (end.broke) {
        this.board.T[i] = EMPTY; this.board.V[i] = 0;
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * 6.283, sp = rand(this.cs * 1, this.cs * 3.4);
          this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 0.6, size: rand(3, 6), col: '#9aa6bd' });
        }
        this.shake += 3;
      } else this.board.V[i] = end.v;
    } else if (end.kind === 'out') {
      for (let k = 0; k < 4; k++) this.parts.push({ x, y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.2, max: 0.2, size: 2, col });
    }
  }

  ring(x, y, r, col, life) { this.rings.push({ x, y, r, col, life, max: life }); }
  floatText(s, x, y, col, size, life = 0.9) { this.texts.push({ s, x, y, col, size, life, max: life }); }

  finishTap(res) {
    this.board = cloneBoard(this.sim);
    this.burstCol = {};
    const left = orbCount(this.sim);
    if (left === 0) {
      this.phase = 'over';
      this.flash = 1; sfx.win(); haptic(40);
      const [cx, cy] = [this.W / 2, this.oy + this.cs * ROWS / 2];
      for (let k = 0; k < 90; k++) {
        const a = Math.random() * 6.283, sp = rand(100, 520);
        this.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: rand(0.8, 1.6), max: 1.6, size: rand(3, 6.5), col: this.cols[k % 3], g: 260 });
      }
      setTimeout(() => this.cb.onWin && this.cb.onWin({ used: this.used, maxCombo: this.maxCombo, bursts: this.bursts }), 900);
    } else if (this.tapsLeft <= 0) {
      this.phase = 'over';
      sfx.fail(); haptic(60);
      setTimeout(() => this.cb.onLose && this.cb.onLose(), 650);
    } else this.phase = 'idle';
  }

  // ---------- main loop ----------

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt; this.clock += dt;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    if (this.timeline.length) {
      const due = this.timeline.filter((e) => e.t <= this.clock).sort((a, b) => a.t - b.t);
      if (due.length) {
        this.timeline = this.timeline.filter((e) => e.t > this.clock);
        for (const e of due) e.fn();
      }
    }
    this.shards = this.shards.filter((s) => this.clock - s.t0 < s.dur + 0.18);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy = p.vy * 0.97 + (p.g || 0) * dt; }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 26 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (let i = 0; i < N; i++) if (this.bounce[i] > 0) this.bounce[i] = Math.max(0, this.bounce[i] - dt * 4.5);
    this.shake *= Math.pow(0.0008, dt); if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.mode === 'menu') {
      for (const o of this.menuOrbs) { o.y -= o.s * dt; if (o.y < -0.1) Object.assign(o, this.newMenuOrb(false)); }
    }
  }

  sprite(col, r) {
    const key = col + '|' + Math.round(r);
    let c = this.sprites.get(key);
    if (c) return c;
    const size = Math.ceil(r * 4 * this.dpr);
    c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), m = size / 2, rr = r * this.dpr;
    const glow = g.createRadialGradient(m, m, rr * 0.5, m, m, rr * 2);
    glow.addColorStop(0, col + 'aa'); glow.addColorStop(1, col + '00');
    g.fillStyle = glow; g.beginPath(); g.arc(m, m, rr * 2, 0, 6.283); g.fill();
    const body = g.createRadialGradient(m - rr * 0.35, m - rr * 0.4, rr * 0.1, m, m, rr);
    body.addColorStop(0, '#ffffff'); body.addColorStop(0.25, col); body.addColorStop(1, shade(col, -0.45));
    g.fillStyle = body; g.beginPath(); g.arc(m, m, rr, 0, 6.283); g.fill();
    this.sprites.set(key, c);
    return c;
  }

  draw() {
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.mode === 'menu') { this.drawMenu(ctx); return; }
    if (!this.board) return;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    const cs = this.cs;
    // board plate + grid
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    roundRect(ctx, this.ox - 6, this.oy - 6, cs * COLS + 12, cs * ROWS + 12, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const [px, py] = this.ptPx(x, y); ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.283); ctx.fill();
    }
    // pieces
    const { T, V } = this.board;
    for (let i = 0; i < N; i++) {
      const t = T[i]; if (t === EMPTY) continue;
      const [px, py] = this.cellPx(i);
      const sc = 1 + this.bounce[i] * 0.28;
      if (t === ORB) this.drawOrb(ctx, px, py, V[i], sc, i);
      else if (t === STONE) this.drawStone(ctx, px, py, V[i], sc);
      else this.drawMirror(ctx, px, py, t);
    }
    // hint
    if (this.hintIdx >= 0 && this.phase === 'idle') {
      const [px, py] = this.cellPx(this.hintIdx);
      const p = (Math.sin(this.time * 7) + 1) / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + p * 0.5})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, cs * (0.5 + p * 0.12), 0, 6.283); ctx.stroke();
      ctx.font = `${Math.round(cs * 0.55)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👆', px + cs * 0.1, py + cs * 0.72 + p * 6);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shards) this.drawShard(ctx, s);
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.col; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + k * 0.8), 0, 6.283); ctx.stroke();
    }
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life / p.max), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.5));
      const s = t.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.3));
      ctx.font = `900 ${Math.round(s)}px system-ui, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,8,30,0.75)'; ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`; ctx.fillRect(0, 0, this.W, this.H); }
  }

  drawOrb(ctx, px, py, v, sc, i) {
    const cs = this.cs;
    const r = cs * 0.36;
    const col = this.cols[Math.min(2, Math.max(0, v - 1))];
    let s = sc;
    if (v >= 3) s *= 1 + 0.06 * Math.sin(this.time * 9 + i);
    const spr = this.sprite(col, r);
    const d = spr.width / this.dpr * s;
    ctx.drawImage(spr, px - d / 2, py - d / 2, d, d);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const pr = r * 0.13 * s;
    const dots = v === 1 ? [[0, 0]] : v === 2 ? [[-0.3, 0], [0.3, 0]] : [[0, -0.3], [-0.3, 0.2], [0.3, 0.2]];
    for (const [dx, dy] of dots) { ctx.beginPath(); ctx.arc(px + dx * r * s, py + dy * r * s, pr, 0, 6.283); ctx.fill(); }
  }

  drawStone(ctx, px, py, hp, sc) {
    const s = this.cs * 0.72 * sc;
    const g = ctx.createLinearGradient(px, py - s / 2, px, py + s / 2);
    g.addColorStop(0, '#8793ad'); g.addColorStop(1, '#4b556b');
    ctx.fillStyle = g; roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    if (hp <= 1) {
      ctx.strokeStyle = 'rgba(20,20,40,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px - s * 0.1, py - s * 0.4); ctx.lineTo(px + s * 0.05, py - s * 0.05); ctx.lineTo(px - s * 0.12, py + s * 0.12); ctx.lineTo(px + s * 0.1, py + s * 0.4); ctx.stroke();
    }
  }

  drawMirror(ctx, px, py, t) {
    const s = this.cs * 0.74;
    ctx.fillStyle = 'rgba(160,200,255,0.10)'; roundRect(ctx, px - s / 2, py - s / 2, s, s, s * 0.2); ctx.fill();
    ctx.strokeStyle = 'rgba(190,225,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    const a = t === MIR_A ? 1 : -1;
    ctx.strokeStyle = '#d8f1ff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(px - s * 0.32, py + a * s * 0.32); ctx.lineTo(px + s * 0.32, py - a * s * 0.32); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawShard(ctx, s) {
    const k = Math.min(1, (this.clock - s.t0) / s.dur);
    const head = k * s.len;
    const fade = this.clock - s.t0 > s.dur ? 1 - (this.clock - s.t0 - s.dur) / 0.18 : 1;
    const step = this.cs * 0.1;
    for (let j = 0; j < 9; j++) {
      const d = Math.max(0, head - j * step);
      const p = pointAlong(s.pts, d);
      ctx.globalAlpha = Math.max(0, (1 - j / 9) * fade);
      ctx.fillStyle = s.col;
      ctx.beginPath(); ctx.arc(p[0], p[1], this.cs * 0.1 * (1 - j / 11) + 1, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMenu(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    const cols = this.cols;
    for (const o of this.menuOrbs) {
      const x = o.x * this.W + Math.sin(this.time * 0.6 + o.ph) * 18, y = o.y * this.H;
      const spr = this.sprite(cols[o.v - 1], o.r);
      const d = spr.width / this.dpr;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(spr, x - d / 2, y - d / 2, d, d);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

function pointAlong(pts, d) {
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (d <= l || k === pts.length - 1) {
      const t = l ? Math.min(1, d / l) : 1;
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
    }
    d -= l;
  }
  return pts[0];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
