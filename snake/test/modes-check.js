// Plays every mode with both built-in AIs and prints how they do: node snake/test/modes-check.js [games]
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const games = Number(process.argv[2] || 3);
const size = process.argv[3] || 'small';
for (const mode of E.MODES) for (const kind of ['perfect', 'risky']) {
  let wins = 0, score = 0, steps = 0, t = Date.now(); const reasons = {};
  for (let s = 0; s < games; s++) {
    const g = new E.Game({ size, apples: 1, modes: [mode.id], seed: s * 31 + 5 });
    const ai = AI.createAI(kind, g);
    while (!g.over && g.steps < 5000) g.step(ai.decide(g));
    if (g.won) wins++; else reasons[g.reason || 'timeout'] = (reasons[g.reason || 'timeout'] || 0) + 1;
    score += g.score; steps += g.steps;
  }
  console.log(`${mode.id.padEnd(12)} ${kind.padEnd(8)} wins ${wins}/${games} avgScore ${(score / games).toFixed(1).padStart(6)} ms/move ${((Date.now() - t) / steps).toFixed(2)} ${JSON.stringify(reasons)}`);
}
