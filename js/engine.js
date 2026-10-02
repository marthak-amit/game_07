// Bloom Chain — pure game logic (no DOM). Shared by the game and the node tests.
//
// Rules: tap an orb to add 1 charge. An orb that would pass 3 bursts and fires
// 4 sparks (up/right/down/left). A spark flies until it hits something:
//   orb    -> +1 charge (may burst in the next wave)
//   stone  -> -1 hp (breaks at 0), spark stops
//   mirror -> spark turns 90 degrees and keeps flying
// Clear every orb within the tap budget.

export const COLS = 6;
export const ROWS = 8;
export const N = COLS * ROWS;
export const EMPTY = 0, ORB = 1, STONE = 2, MIR_A = 3 /* '/' */, MIR_B = 4 /* '\' */;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const MAX_WAVES = 80;
const MAX_STEPS = 64;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newBoard = () => ({ T: new Int8Array(N), V: new Int8Array(N) });
export const cloneBoard = (b) => ({ T: b.T.slice(), V: b.V.slice() });
export function orbCount(b) {
  let c = 0;
  for (let i = 0; i < N; i++) if (b.T[i] === ORB) c++;
  return c;
}
export function boardKey(b) {
  let s = '';
  for (let i = 0; i < N; i++) s += String.fromCharCode(48 + b.T[i] * 5 + b.V[i]);
  return s;
}

function trace(b, from, dir, next) {
  const { T, V } = b;
  let x = from % COLS, y = (from / COLS) | 0;
  let dx = DX[dir], dy = DY[dir];
  const pts = [[x, y]];
  for (let step = 0; step < MAX_STEPS; step++) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
      pts.push([x, y]);
      return { from, dir, pts, end: { kind: 'out' } };
    }
    const j = y * COLS + x, t = T[j];
    if (t === EMPTY) continue;
    pts.push([x, y]);
    if (t === MIR_A) { const ndx = -dy, ndy = -dx; dx = ndx; dy = ndy; continue; }
    if (t === MIR_B) { const ndx = dy, ndy = dx; dx = ndx; dy = ndy; continue; }
    if (t === ORB) {
      if (V[j] >= 4) return { from, dir, pts, end: { kind: 'absorb', idx: j } };
      V[j]++;
      if (V[j] > 3) { V[j] = 4; next.push(j); }
      return { from, dir, pts, end: { kind: 'orb', idx: j, v: V[j] } };
    }
    // stone
    V[j]--;
    const broke = V[j] <= 0;
    if (broke) { T[j] = EMPTY; V[j] = 0; }
    return { from, dir, pts, end: { kind: 'stone', idx: j, v: V[j], broke } };
  }
  return { from, dir, pts, end: { kind: 'lost' } };
}

// Applies a tap in place. If `log` is an array it receives the animation steps.
// Returns { ok, bursts, waves }.
export function resolveTap(b, idx, log = null) {
  const { T, V } = b;
  if (T[idx] !== ORB) return { ok: false, bursts: 0, waves: 0 };
  V[idx]++;
  if (log) log.push({ type: 'tap', idx, v: Math.min(V[idx], 3) });
  let cur = V[idx] > 3 ? [idx] : [];
  let bursts = 0, waves = 0;
  while (cur.length && waves < MAX_WAVES) {
    waves++;
    for (const i of cur) { T[i] = EMPTY; V[i] = 0; }
    bursts += cur.length;
    const next = [], shards = [];
    for (const i of cur) for (let d = 0; d < 4; d++) shards.push(trace(b, i, d, next));
    if (log) log.push({ type: 'wave', bursts: cur.slice(), shards });
    cur = next;
  }
  for (const i of cur) { T[i] = EMPTY; V[i] = 0; }
  return { ok: true, bursts, waves };
}

const heuristic = (b) => {
  let orbs = 0, need = 0;
  for (let i = 0; i < N; i++) if (b.T[i] === ORB) { orbs++; need += 4 - b.V[i]; }
  return orbs * 10 + need;
};

// Beam search. Returns { path, solved }; path is a list of cell indexes to tap.
// When unsolved within maxDepth, path is the most promising partial line.
export function solve(b, maxDepth = 7, width = 36) {
  if (orbCount(b) === 0) return { path: [], solved: true };
  let beam = [{ b, path: [], score: 0 }];
  const seen = new Set([boardKey(b)]);
  let best = null;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const cand = [];
    for (const node of beam) {
      for (let i = 0; i < N; i++) {
        if (node.b.T[i] !== ORB) continue;
        const nb = cloneBoard(node.b);
        resolveTap(nb, i);
        const path = node.path.concat(i);
        if (orbCount(nb) === 0) return { path, solved: true };
        const key = boardKey(nb);
        if (seen.has(key)) continue;
        seen.add(key);
        cand.push({ b: nb, path, score: heuristic(nb) });
      }
    }
    if (!cand.length) break;
    cand.sort((p, q) => p.score - q.score);
    beam = cand.slice(0, width);
    if (!best || beam[0].score < best.score) best = beam[0];
  }
  return { path: best ? best.path : [], solved: false };
}

// ---------- level generation ----------

export function levelParams(n) {
  const minPar = Math.min(5, 1 + Math.floor(n / 8));
  return {
    orbs: Math.min(15, 4 + Math.floor(n * 0.45)),
    stones: n >= 6 ? Math.min(6, 1 + Math.floor((n - 6) / 6)) : 0,
    mirrors: n >= 12 ? Math.min(4, 1 + Math.floor((n - 12) / 10)) : 0,
    minPar,
    maxPar: Math.min(7, minPar + 2),
  };
}

const HAND = {
  // level -> [[x, y, type, value], ...]
  1: [[2, 5, 1, 3], [2, 2, 1, 3], [4, 2, 1, 3]],
  2: [[0, 6, 1, 3], [0, 3, 1, 3], [4, 7, 1, 3], [4, 2, 1, 3], [1, 2, 1, 3]],
};

function boardFromList(list) {
  const b = newBoard();
  for (const [x, y, t, v] of list) { b.T[y * COLS + x] = t; b.V[y * COLS + x] = v; }
  return b;
}

function finish(board, solution, n, tip) {
  const par = solution.length;
  return { board, par, limit: par + (n < 15 ? 2 : 1), solution, tip };
}

const levelCache = new Map();

export function generateLevel(n, seed = n * 1000003 + 17, params = levelParams(n)) {
  const cacheKey = n + ':' + seed;
  if (levelCache.has(cacheKey)) {
    const c = levelCache.get(cacheKey);
    return { ...c, board: cloneBoard(c.board) };
  }
  let result;
  if (HAND[n] && seed === n * 1000003 + 17) {
    const board = boardFromList(HAND[n]);
    result = finish(board, solve(board).path, n);
  } else {
    let fallback = null;
    for (let attempt = 0; attempt < 600; attempt++) {
      const rng = mulberry32(seed + attempt * 7919);
      const board = buildBoard(rng, params);
      const s = solve(board, params.maxPar, 28);
      if (!s.solved) continue;
      if (s.path.length >= params.minPar) { result = finish(board, s.path, n); break; }
      if (!fallback || s.path.length > fallback.sol.length) fallback = { board, sol: s.path };
    }
    if (!result) {
      const f = fallback || { board: boardFromList(HAND[1]), sol: [2 * COLS + 2 + 3 * COLS] };
      result = finish(f.board, f.sol.length ? f.sol : solve(f.board).path, n);
    }
  }
  levelCache.set(cacheKey, result);
  return { ...result, board: cloneBoard(result.board) };
}

function buildBoard(rng, p) {
  const b = newBoard();
  const free = () => {
    for (let k = 0; k < 60; k++) {
      const i = Math.floor(rng() * N);
      if (b.T[i] === EMPTY) return i;
    }
    return -1;
  };
  const placed = [];
  const alignedFree = () => {
    for (let k = 0; k < 40; k++) {
      const o = placed[Math.floor(rng() * placed.length)];
      const ox = o % COLS, oy = (o / COLS) | 0;
      const i = rng() < 0.5
        ? Math.floor(rng() * ROWS) * COLS + ox
        : oy * COLS + Math.floor(rng() * COLS);
      if (b.T[i] === EMPTY) return i;
    }
    return free();
  };
  const w3 = 0.34 + Math.min(0.2, p.orbs * 0.01);
  for (let k = 0; k < p.orbs; k++) {
    const i = placed.length && rng() < 0.82 ? alignedFree() : free();
    if (i < 0) break;
    const r = rng();
    b.T[i] = ORB;
    b.V[i] = r < w3 ? 3 : r < w3 + 0.34 ? 2 : 1;
    placed.push(i);
  }
  for (let k = 0; k < p.stones; k++) {
    const i = placed.length && rng() < 0.7 ? alignedFree() : free();
    if (i < 0) break;
    b.T[i] = STONE; b.V[i] = rng() < 0.5 ? 2 : 1;
  }
  for (let k = 0; k < p.mirrors; k++) {
    const i = alignedFree();
    if (i < 0) break;
    b.T[i] = rng() < 0.5 ? MIR_A : MIR_B; b.V[i] = 0;
  }
  return b;
}

export function dailySeed(dateStr) {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) { h ^= dateStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function generateDaily(dateStr, difficulty = 22) {
  return generateLevel(difficulty, dailySeed(dateStr), levelParams(difficulty));
}

export function starsFor(used, par) {
  return used <= par ? 3 : used <= par + 1 ? 2 : 1;
}
