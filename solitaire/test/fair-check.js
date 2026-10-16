// Plays deals with the fair AI (no peeking): node solitaire/test/fair-check.js [deals] [draw]
const S = require('../js/engine.js');
const AI = require('../js/solver.js');
const n = Number(process.argv[2] || 10), draw = Number(process.argv[3] || 1);
let wins = 0, t0 = Date.now();
for (let seed = 1; seed <= n; seed++) {
  const g = new S.Game({ draw, seed });
  const ai = new AI.FairAI();
  let stuck = 0, last = -1;
  while (!g.won() && g.moves < 1500) {
    const m = ai.decide(g);
    if (!g.isLegal(m)) { console.log('illegal', m); break; }
    g.apply(m);
    const prog = g.foundCount() * 100 - g.downCount();
    if (prog === last) { if (++stuck > 200) break; } else { stuck = 0; last = prog; }
  }
  if (g.won()) wins++;
  console.log('seed', seed, g.won() ? 'WIN' : 'lost', 'home', g.foundCount(), 'moves', g.moves);
}
console.log(`fair AI draw ${draw}: ${wins}/${n} wins, ${((Date.now() - t0) / n / 1000).toFixed(1)} s per deal`);
