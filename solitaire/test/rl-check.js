// Trains the self-learning AI headless: node solitaire/test/rl-check.js [episodes] [draw]
const S = require('../js/engine.js');
const RL = require('../js/rl.js');
const n = Number(process.argv[2] || 300), draw = Number(process.argv[3] || 1);
const tr = new RL.Trainer(RL.DEFAULTS, { draw });
const t = Date.now();
while (tr.episodes.length < n) tr.tick();
for (let i = 0; i < n; i += 50) {
  const s = tr.episodes.slice(i, i + 50);
  console.log(`attempts ${i + 1}-${i + s.length}: avg cards home ${(s.reduce((a, e) => a + e.home, 0) / s.length).toFixed(1)}, wins ${s.filter(e => e.won).length}`);
}
console.log(`${tr.totalMoves} moves in ${((Date.now() - t) / 1000).toFixed(1)}s`);
let ok = 0;
for (const ep of tr.episodes.slice(-20)) {
  const g = new S.Game({ draw: ep.cfg.draw, seed: ep.seed });
  for (const a of ep.moves) g.apply(S.decode(a));
  if (g.foundCount() === ep.home) ok++;
}
console.log(`replays match: ${ok}/20`);
