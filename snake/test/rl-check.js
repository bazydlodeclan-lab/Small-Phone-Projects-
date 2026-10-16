// Trains the self-learning AI headless and prints progress: node snake/test/rl-check.js [episodes] [size]
const E = require('../js/engine.js');
const RL = require('../js/rl.js');
const n = Number(process.argv[2] || 300), size = process.argv[3] || 'small';
const tr = new RL.Trainer(RL.DEFAULTS, { size, apples: 1, modes: ['classic'] });
const t = Date.now();
while (tr.episodes.length < n) tr.tick();
for (let i = 0; i < n; i += 50) {
  const s = tr.episodes.slice(i, i + 50);
  console.log(`episodes ${i + 1}-${i + s.length}: avg score ${(s.reduce((a, e) => a + e.score, 0) / s.length).toFixed(1)}, best ${Math.max(...s.map(e => e.score))}`);
}
console.log(`${tr.totalSteps} moves in ${((Date.now() - t) / 1000).toFixed(1)}s`);
// replay check: the stored moves must reproduce the same score
let ok = 0;
for (const ep of tr.episodes.slice(-20)) {
  const g = new E.Game({ size, apples: 1, modes: ['classic'], seed: ep.seed });
  for (const d of ep.moves) g.step(d);
  if (g.score === ep.score) ok++;
}
console.log(`replays match: ${ok}/20`);
