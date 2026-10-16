/* The Solitaire AIs.
   - Solver: looks at every card (even face-down ones) and searches for a full win.
     It can prove a deal is winnable or not, so it wins every deal that can be won.
   - Fair player: only knows the cards you could see. It imagines many possible
     layouts of the hidden cards, solves each one, and picks the move that wins most often. */
(function (root) {
  'use strict';
  const S = root.SolEngine || require('./engine.js');
  const { suit, rank, red } = S;

  // A card is safe to send home when no card that could ever need it is left
  function safeHome(g, c) {
    const r = rank(c);
    if (r <= 1) return true;
    const reds = red(c);
    for (let s = 0; s < 4; s++) {
      const isRed = s === 1 || s === 2;
      if (isRed !== reds && g.found[s].length < r) return false;
    }
    return true;
  }

  // Send all safe cards home; returns the moves made
  function autoHome(g) {
    const done = [];
    let again = true;
    while (again) {
      again = false;
      if (g.waste.length) {
        const w = g.waste[g.waste.length - 1];
        if (g.canFound(w) && safeHome(g, w)) { g.apply({ t: 'w2f' }); done.push({ t: 'w2f' }); again = true; continue; }
      }
      for (let i = 0; i < 7; i++) {
        const col = g.tab[i];
        if (!col.length) continue;
        const c = col[col.length - 1];
        if (g.canFound(c) && safeHome(g, c)) { g.apply({ t: 't2f', from: i }); done.push({ t: 't2f', from: i }); again = true; break; }
      }
    }
    return done;
  }

  // Cards reachable from the stock by drawing (assumes unlimited passes)
  function talonCards(g) {
    const d = g.draw, res = [], seen = new Set();
    let st = g.stock.slice(), wa = g.waste.slice();
    const total = Math.ceil(st.length / d) + 2 + Math.ceil((st.length + wa.length) / d);
    for (let k = 0; k <= total; k++) {
      if (wa.length) {
        const c = wa[wa.length - 1];
        if (!seen.has(c)) { seen.add(c); res.push({ card: c, draws: k }); }
      }
      if (st.length) { for (let n = 0; n < d && st.length; n++) wa.push(st.pop()); }
      else { if (!wa.length) break; st = wa.reverse(); wa = []; }
    }
    return res;
  }

  const drawN = n => { const a = []; for (let i = 0; i < n; i++) a.push({ t: 'draw' }); return a; };

  // Candidate move sequences from a position, most promising first
  function shuffleIn(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function candidates(g, rnd) {
    const A = [], B = [], C = [], D = [], E = [], F = [];
    const firstEmpty = g.tab.findIndex(c => !c.length);
    // to foundation from tableau
    for (let i = 0; i < 7; i++) {
      const col = g.tab[i];
      if (col.length && g.canFound(col[col.length - 1])) A.push([{ t: 't2f', from: i }]);
    }
    // tableau to tableau
    for (let i = 0; i < 7; i++) {
      const col = g.tab[i];
      for (let idx = g.down[i]; idx < col.length; idx++) {
        const c = col[idx];
        for (let j = 0; j < 7; j++) {
          if (j === i) continue;
          const empty = !g.tab[j].length;
          if (empty && (j !== firstEmpty || idx === 0)) continue; // all empty columns are the same
          if (!g.canStackOn(c, j)) continue;
          const m = [{ t: 't2t', from: i, idx, to: j }];
          if (idx === g.down[i] && g.down[i] > 0) B.push({ m, w: g.down[i] });          // reveals a card
          else if (idx === 0) { if (!empty) D.push(m); }                                 // empties a column
          else if (idx > g.down[i] && g.canFound(col[idx - 1])) E.push(m);               // frees a card to go home
        }
      }
    }
    B.sort((a, b) => b.w - a.w);
    // from the stock
    for (const { card, draws } of talonCards(g)) {
      if (g.canFound(card)) A.push(drawN(draws).concat([{ t: 'w2f' }]));
      for (let j = 0; j < 7; j++) {
        if (!g.tab[j].length && j !== firstEmpty) continue;
        if (g.canStackOn(card, j)) C.push(drawN(draws).concat([{ t: 'w2t', to: j }]));
      }
    }
    // back down from the foundation, only if something can then land on it
    for (let f = 0; f < 4; f++) {
      const p = g.found[f];
      if (p.length < 2) continue;
      const c = p[p.length - 1];
      for (let j = 0; j < 7; j++) {
        if (!g.canStackOn(c, j)) continue;
        F.push([{ t: 'f2t', from: f, to: j }]);
      }
    }
    if (rnd) { shuffleIn(A, rnd); shuffleIn(B, rnd); B.sort((a, b) => b.w - a.w); shuffleIn(C, rnd); shuffleIn(D, rnd); shuffleIn(E, rnd); }
    return A.concat(B.map(x => x.m), C, D, E, F);
  }

  // Position id for the search. With draw 1 every stock card can be reached by
  // drawing, so only the order of the stock matters, not where we are in it.
  // Column order doesn't matter either, so columns are sorted.
  function posKey(g) {
    const cols = [];
    for (let i = 0; i < 7; i++) cols.push(g.down[i] + ':' + g.tab[i].join(','));
    cols.sort();
    const talon = g.draw === 3 ? g.stock.join(',') + '/' + g.waste.join(',') : g.waste.join(',') + ',' + g.stock.slice().reverse().join(',');
    return cols.join('|') + '|' + g.found.map(f => f.length).join(',') + '|' + talon;
  }

  const solvedNow = g => g.foundCount() === 52 || (g.downCount() === 0 && !g.stock.length && !g.waste.length);

  // Finish moves once everything is face up
  function finishMoves(g) {
    const out = [], h = g.clone();
    while (h.foundCount() < 52) {
      let moved = false;
      if (h.waste.length && h.canFound(h.waste[h.waste.length - 1])) { h.apply({ t: 'w2f' }); out.push({ t: 'w2f' }); moved = true; }
      for (let i = 0; i < 7 && !moved; i++) {
        const col = h.tab[i];
        if (col.length && h.canFound(col[col.length - 1])) { h.apply({ t: 't2f', from: i }); out.push({ t: 't2f', from: i }); moved = true; }
      }
      if (!moved) {
        if (!h.stock.length && !h.waste.length) break;
        h.apply({ t: 'draw' }); out.push({ t: 'draw' });
      }
    }
    return out;
  }

  // Depth-first search that can run a little at a time (so the page never freezes)
  class Search {
    constructor(game, limit, rnd) {
      this.limit = limit;
      this.rnd = rnd;
      this.nodes = 0;
      this.seen = new Set();
      const g = game.clone();
      const entry = autoHome(g);
      this.stack = [{ g, entry, cands: null, i: 0 }];
      this.result = null;
    }

    run(budget) {
      if (this.result) return this.result;
      let n = 0;
      while (this.stack.length) {
        if (n++ >= budget) return null;
        const top = this.stack[this.stack.length - 1];
        if (!top.cands) {
          if (solvedNow(top.g)) return this.finish(top.g);
          top.cands = candidates(top.g, this.rnd);
        }
        if (top.i >= top.cands.length) { this.stack.pop(); continue; }
        const seq = top.cands[top.i++];
        const g = top.g.clone();
        for (const m of seq) g.apply(m);
        const entry = seq.concat(autoHome(g));
        const k = posKey(g);
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        if (++this.nodes > this.limit) { this.result = { status: 'unknown', nodes: this.nodes }; return this.result; }
        this.stack.push({ g, entry, cands: null, i: 0 });
      }
      this.result = { status: 'lose', nodes: this.nodes };
      return this.result;
    }

    finish(g) {
      const moves = [];
      for (const f of this.stack) moves.push(...f.entry);
      moves.push(...finishMoves(g));
      this.result = { status: 'win', moves, nodes: this.nodes };
      return this.result;
    }

  }

  // Several searches in a row: the first in the usual order, then shuffled orders.
  // Hard deals often fall to a fresh start much faster than to one long search.
  class Solver {
    constructor(game, limit) {
      this.game = game;
      this.total = limit || 150000;
      this.parts = [0.4, 0.2, 0.2, 0.2];
      this.k = 0; this.nodes = 0;
      this.cur = new Search(game, Math.floor(this.total * this.parts[0]), null);
      this.result = null;
    }
    run(budget) {
      if (this.result) return this.result;
      const r = this.cur.run(budget);
      if (!r) return null;
      this.nodes += r.nodes;
      if (r.status !== 'unknown' || ++this.k >= this.parts.length) { this.result = Object.assign({}, r, { nodes: this.nodes }); return this.result; }
      let seed = this.game.seed * 31 + this.k;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      this.cur = new Search(this.game, Math.floor(this.total * this.parts[this.k]), rnd);
      return null;
    }
    solve() { let r; while (!(r = this.run(1e9))); return r; }
  }

  function solve(game, limit) { return new Solver(game, limit).solve(); }

  // ---------- Fair player ----------
  // Fill the unknown spots with a random guess of the unknown cards
  function imagine(g, rnd) {
    const h = g.clone();
    const unknown = [];
    for (let c = 0; c < 52; c++) if (!g.seen[c]) unknown.push(c);
    for (let i = unknown.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [unknown[i], unknown[j]] = [unknown[j], unknown[i]]; }
    let k = 0;
    for (let i = 0; i < 7; i++) for (let p = 0; p < h.down[i]; p++) if (!g.seen[h.tab[i][p]]) h.tab[i][p] = unknown[k++];
    for (let p = 0; p < h.stock.length; p++) if (!g.seen[h.stock[p]]) h.stock[p] = unknown[k++];
    return h;
  }

  const moveKey = m => [m.t, m.from, m.idx, m.to].join(':');

  class FairAI {
    constructor(opts) {
      opts = opts || {};
      this.samples = opts.samples || 8;
      this.limit = opts.limit || 3000;
      this.plan = null; this.planSeen = -1;
      this.rnd = Math.random;
    }

    decide(g) {
      const seenCount = g.seen.reduce((a, b) => a + b, 0);
      // Keep following the last plan while nothing new has been revealed
      if (this.plan && this.plan.length && this.planSeen === seenCount && g.isLegal(this.plan[0])) return this.plan.shift();
      const votes = new Map();
      let bestPlan = null, bestVotes = 0;
      for (let s = 0; s < this.samples; s++) {
        const r = solve(imagine(g, this.rnd), this.limit);
        if (r.status !== 'win' || !r.moves.length) continue;
        const k = moveKey(r.moves[0]);
        const v = (votes.get(k) || 0) + 1;
        votes.set(k, v);
        if (v > bestVotes) { bestVotes = v; bestPlan = r.moves; }
      }
      if (bestPlan) {
        this.plan = bestPlan.slice(1); this.planSeen = seenCount;
        return bestPlan[0];
      }
      this.plan = null;
      return heuristicMove(g);
    }
  }

  // Simple rules of thumb, used when no imagined layout can be won
  function heuristicMove(g) {
    const moves = g.legalMoves();
    let best = null, bs = -Infinity;
    for (const m of moves) {
      let s = 0;
      if (m.t === 't2f' || m.t === 'w2f') s = 50;
      else if (m.t === 't2t') {
        if (m.idx === g.down[m.from] && g.down[m.from] > 0) s = 40 + g.down[m.from];
        else if (m.idx === 0 && g.tab[m.to].length) s = 10;
        else s = -5;
      } else if (m.t === 'w2t') s = 20;
      else if (m.t === 'draw') s = 1;
      else if (m.t === 'f2t') s = -20;
      if (s > bs) { bs = s; best = m; }
    }
    return best || { t: 'draw' };
  }

  // Solver as an AI player: solves once, then plays the solution
  class SolverAI {
    constructor(limit) { this.limit = limit || 400000; this.plan = null; this.status = null; }
    decide(g) {
      if (!this.plan) {
        const r = solve(g, this.limit);
        this.status = r.status;
        this.plan = r.status === 'win' ? r.moves.slice() : [];
      }
      if (this.plan.length && g.isLegal(this.plan[0])) return this.plan.shift();
      return heuristicMove(g);
    }
  }

  const api = { Solver, solve, FairAI, SolverAI, heuristicMove, talonCards, autoHome, safeHome };
  root.SolAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
