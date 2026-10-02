import assert from 'node:assert/strict';
import { generateLevel, generateDaily, solve, resolveTap, cloneBoard, orbCount, starsFor, N } from '../js/engine.js';

let worst = 0, total = 0;
const parHist = {};
for (let n = 1; n <= 150; n++) {
  const t0 = performance.now();
  const lv = generateLevel(n);
  const dt = performance.now() - t0;
  worst = Math.max(worst, dt); total += dt;
  // replaying the stored solution must clear the board within the tap limit
  const b = cloneBoard(lv.board);
  assert(lv.solution.length >= 1, `level ${n} has solution`);
  for (const i of lv.solution) assert(resolveTap(b, i).ok, `level ${n}: solution tap valid`);
  assert.equal(orbCount(b), 0, `level ${n} solved by stored solution`);
  assert(lv.limit > lv.par);
  parHist[lv.par] = (parHist[lv.par] || 0) + 1;
}
console.log('generated 150 levels, avg %sms worst %sms', (total / 150).toFixed(1), worst.toFixed(0));
console.log('par histogram', parHist);

// determinism
const a = generateLevel(37), c = generateLevel(37);
assert.deepEqual([...a.board.T], [...c.board.T]);
assert.deepEqual(a.solution, c.solution);

// level 1 is the intended single-tap tutorial
assert.equal(generateLevel(1).par, 1);
assert.equal(generateLevel(2).par, 2);

// daily is stable per date and differs across dates
const d1 = generateDaily('2026-10-02'), d2 = generateDaily('2026-10-02'), d3 = generateDaily('2026-10-03');
assert.deepEqual([...d1.board.T], [...d2.board.T]);
assert.notDeepEqual([...d1.board.V], [...d3.board.V]);

// charge/burst rules
const lv = generateLevel(1);
const b = cloneBoard(lv.board);
const log = [];
const r = resolveTap(b, lv.solution[0], log);
assert(r.bursts === 3 && r.waves === 2, 'level 1: one tap on the middle orb bursts all 3');
assert.equal(orbCount(b), 0);

// hint solver on live boards
const live = generateLevel(40);
const s = solve(live.board, 7);
assert(s.solved && s.path.length >= 1);

assert.equal(starsFor(2, 2), 3);
assert.equal(starsFor(3, 2), 2);
assert.equal(starsFor(5, 2), 1);
assert(N === 48);
console.log('engine tests passed');
