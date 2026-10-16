// Headless checks: run with  node snake/test/run-tests.js
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

// 1. Every board's loop must visit each cell exactly once and only step to neighbours
for (const size of Object.keys(E.SIZES)) {
  const { w, h } = E.SIZES[size];
  const cyc = AI.buildCycle(w, h);
  const seen = new Set(cyc.pts.map(([x, y]) => y * w + x));
  const expect = (w * h) % 2 ? w * h - 1 : w * h;
  check(seen.size === expect && cyc.pts.length === expect, `${size} loop covers ${seen.size}/${expect}`);
  for (let i = 0; i < cyc.pts.length; i++) {
    const [ax, ay] = cyc.pts[i], [bx, by] = cyc.pts[(i + 1) % cyc.pts.length];
    check(Math.abs(ax - bx) + Math.abs(ay - by) === 1, `${size} loop step ${i} not adjacent`);
  }
}

// 2. Perfect AI must win every game in the modes where it is guaranteed
function play(cfg, kind, maxSteps) {
  const g = new E.Game(cfg);
  const ai = AI.createAI(kind, g);
  while (!g.over && g.steps < maxSteps) g.step(ai.decide(g));
  return g;
}
const games = Number(process.argv[2] || 20);
const cycleModes = [['classic'], ['borderless'], ['peaceful'], ['cheese'], ['twin'], ['poison'], ['light'], ['cheese', 'poison'], ['poison', 'borderless', 'light']];
for (const modes of cycleModes) for (const size of Object.keys(E.SIZES)) for (const apples of [1, 3, 5, 'dice']) {
  let wins = 0, steps = 0;
  for (let s = 0; s < games; s++) {
    const g = play({ size, apples, modes, seed: s * 7919 + 1 }, 'perfect', 400000);
    if (g.won) wins++; else console.log('  lost', modes.join('+'), size, apples, 'seed', s * 7919 + 1, g.reason || 'too slow', 'score', g.score);
    steps += g.steps;
  }
  check(wins === games, `perfect ${modes.join('+')} ${size} ${apples}: ${wins}/${games}`);
  console.log(`perfect ${modes.join('+').padEnd(12)} ${size.padEnd(8)} apples=${String(apples).padEnd(4)} wins ${wins}/${games}  avg moves ${Math.round(steps / games)}`);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
