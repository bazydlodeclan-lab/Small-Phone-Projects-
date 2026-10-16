// Checks the solver: node solitaire/test/solver-check.js [deals] [draw] [limit]
const S = require('../js/engine.js');
const AI = require('../js/solver.js');
const n = Number(process.argv[2] || 50), draw = Number(process.argv[3] || 1), limit = Number(process.argv[4] || 150000);
const tally = { win: 0, lose: 0, unknown: 0 };
let bad = 0, t0 = Date.now(), maxMs = 0;
for (let seed = 1; seed <= n; seed++) {
  const g = new S.Game({ draw, seed });
  const t = Date.now();
  const r = AI.solve(g, limit);
  maxMs = Math.max(maxMs, Date.now() - t);
  tally[r.status]++;
  if (r.status === 'win') {
    // every solution move must be legal and end in a full win
    const h = new S.Game({ draw, seed });
    for (const m of r.moves) { if (!h.isLegal(m)) { bad++; console.log('illegal move in seed', seed, m); break; } h.apply(m); }
    if (h.foundCount() !== 52) { bad++; console.log('solution did not finish, seed', seed, h.foundCount()); }
  }
}
console.log(`draw ${draw}: wins ${tally.win}, proven unwinnable ${tally.lose}, too hard to decide ${tally.unknown} of ${n}; bad solutions ${bad}; avg ${((Date.now() - t0) / n).toFixed(0)} ms, slowest ${maxMs} ms`);
process.exit(bad ? 1 : 0);
