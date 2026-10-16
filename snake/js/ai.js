/* The built-in AIs that already know how to play.
   - "Perfect": never dies. Uses a loop that covers every cell (a Hamiltonian cycle)
     plus safe shortcuts, so it can always fill the board.
   - "Speedrunner": goes straight for the apple, takes risks.
   Modes with obstacles use a look-ahead search that simulates the real game. */
(function (root) {
  'use strict';
  const E = root.SnakeEngine || require('./engine.js');

  // Modes where the cycle method is guaranteed to work
  const CYCLE_MODES = new Set(['classic', 'borderless', 'peaceful', 'cheese', 'light', 'poison', 'twin']);

  // ---------- Hamiltonian cycle (a path through every cell that loops back) ----------
  function columnCycle(W, H) {
    const p = [];
    for (let y = 0; y < H; y++) p.push([0, y]);
    for (let x = 1; x < W; x++) {
      if (x % 2 === 1) for (let y = H - 1; y >= 1; y--) p.push([x, y]);
      else for (let y = 1; y < H; y++) p.push([x, y]);
    }
    for (let x = W - 1; x >= 1; x--) p.push([x, 0]);
    return p;
  }

  function buildCycle(w, h) {
    let pts, spare = -1, spareTwin = -1;
    if ((w * h) % 2 === 0) {
      pts = w % 2 === 0 ? columnCycle(w, h) : columnCycle(h, w).map(([a, b]) => [b, a]);
    } else {
      // Odd x odd boards can't have a full loop. Loop over every cell except the
      // bottom-right corner, and let that corner swap in for its diagonal neighbour.
      const R = h - 1;
      const base = columnCycle(R, w).map(([a, b]) => [b, a]);
      pts = [];
      for (let i = 0; i < base.length; i++) {
        const p = base[i], q = base[(i + 1) % base.length];
        pts.push(p);
        const lo = Math.min(p[0], q[0]);
        if (p[1] === R - 1 && q[1] === R - 1 && Math.abs(p[0] - q[0]) === 1 && lo % 2 === 0 && lo <= w - 3) {
          pts.push([p[0], h - 1], [q[0], h - 1]);
        }
      }
      spare = (h - 1) * w + (w - 1);
      spareTwin = (h - 2) * w + (w - 2);
    }
    const order = new Int32Array(w * h).fill(-1);
    pts.forEach(([x, y], i) => { order[y * w + x] = i; });
    if (spare >= 0) order[spare] = order[spareTwin];
    return { order, N: pts.length, pts, spare };
  }

  function cycleCompatible(game) {
    // Cheese + Twin together can corner the loop at the very end, so it isn't promised
    if (game.m.cheese && game.m.twin) return false;
    return game.snakes.length === 1 && game.cfg.modes.every(m => CYCLE_MODES.has(m));
  }

  class CycleAI {
    constructor(game) {
      this.cyc = buildCycle(game.w, game.h);
      this.sign = 0;
      this.guaranteed = true;
    }

    decide(game) {
      const sn = game.snakes[0], N = this.cyc.N, ord = this.cyc.order;
      const cells = sn.cells, L = cells.length, head = cells[0], tail = cells[L - 1];

      // Which way round the loop are we travelling?
      if (game.ev.reversed) this.sign = -this.sign;
      const a = ord[head], b = ord[cells[1]];
      if ((b + 1) % N === a) this.sign = 1;
      else if ((a + 1) % N === b) this.sign = -1;
      else if (!this.sign) this.sign = ((a - b + N) % N) <= ((b - a + N) % N) ? 1 : -1;
      const s = this.sign;
      const dist = (from, to) => ((((ord[to] - ord[from]) * s) % N) + N) % N;
      const dHT = dist(head, tail);

      // Closest apple ahead of us on the loop
      let target = -1, td = Infinity;
      for (const ap of game.apples) {
        if (!game.canEat(sn, ap)) continue;
        const d = dist(head, ap.c) || N;
        if (d < td) { td = d; target = ap.c; }
      }

      let best = -1, bestRem = Infinity, bestK = Infinity;
      for (let d = 0; d < 4; d++) {
        if (d === (sn.dir + 2) % 4) continue;
        const c = game.neighbor(head, d);
        if (c < 0) continue;
        const k = dist(head, c);
        if (k === 0 || k > dHT) continue; // never jump past our own tail
        const ap = game.appleAt(c);
        const eat = !!(ap && game.canEat(sn, ap));
        const tailMoves = !eat && sn.grow === 0;
        const wins = eat && L + sn.grow + game.g >= game.n;
        if (k === dHT && !tailMoves && !wins) continue;
        // Shortcuts keep a small gap to the tail so the snake can't get stuck circling
        if (k > 1 && (dHT - k < 3 || !this.shortcutOk(game, c, k, eat, tailMoves))) continue;
        if (target >= 0 && (k > td || (k === td && c !== target))) continue; // don't overshoot the apple
        // Odd boards: two cells share a spot on the loop, so prefer the one with the apple
        const rem = (target >= 0 ? td - k : -k) - (eat ? 0.5 : 0);
        if (rem < bestRem || (rem === bestRem && k < bestK)) { best = d; bestRem = rem; bestK = k; }
      }
      if (best < 0) best = survive(game);
      return game.inputFor(best);
    }

    // With +1 growth any forward move that stays in front of the tail is safe.
    // Cheese grows by 2, so shortcuts need room to spare.
    shortcutOk(game, c, k, eat, tailMoves) {
      if (game.g === 1) return true;
      const sn = game.snakes[0], cells = sn.cells, L = cells.length, N = this.cyc.N, ord = this.cyc.order, s = this.sign;
      const dist = (from, to) => ((((ord[to] - ord[from]) * s) % N) + N) % N;
      const L2 = L + (tailMoves ? 0 : 1);
      const P2 = sn.grow + (eat ? game.g : 0) - (tailMoves ? 0 : 1);
      const newTail = tailMoves ? cells[L - 2] : cells[L - 1];
      const A2 = dist(newTail, c) + 1;
      const free = N - A2;
      return L2 + P2 <= N * 0.5 && free - P2 >= game.g * (game.apples.length + 2) + (A2 - L2);
    }
  }

  // ---------- Look-ahead search for every other mode ----------
  // Time-aware flood fill: body parts free up as the snake moves.
  // Returns how much room snake `si` has, whether it can follow a body out,
  // and how long the longest safe wander is (used for stalling).
  function flood(g, si) {
    const n = g.n, freeAt = new Int32Array(n), tailHalf = new Uint8Array(n);
    const me = g.snakes[si || 0];
    for (const s of g.snakes) {
      const L = s.cells.length;
      for (let i = 0; i < L; i++) {
        if (g.m.cheese && i % 2 === 1) continue;
        if (g.m.dimension && s.dims[i] !== me.dim) continue;
        const t = L - i + s.grow;
        if (t > freeAt[s.cells[i]]) freeAt[s.cells[i]] = t;
        if (s === me && i >= L / 2) tailHalf[s.cells[i]] = 1;
      }
    }
    // Cells next to a mine are risky to sit in, so treat them as blocked
    const risky = new Uint8Array(n);
    if (g.m.minesweeper) for (const mc of g.mines) {
      const [mx, my] = g.xy(mc);
      for (let y = my - 1; y <= my + 1; y++) for (let x = mx - 1; x <= mx + 1; x++) {
        if (x >= 0 && y >= 0 && x < g.w && y < g.h) risky[y * g.w + x] = 1;
      }
    }
    const dist = new Int32Array(n).fill(-1);
    const q = [me.cells[0]];
    dist[me.cells[0]] = 0;
    let count = 0, reachBody = false, far = 0;
    const back = (me.dir + 2) % 4;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (let d = 0; d < 4; d++) {
        if (qi === 0 && d === back) continue; // the snake can't reverse
        if (g.m.arrow && g.arrow[c] >= 0 && d !== g.arrow[c]) continue; // forced turn
        const nc = g.neighbor(c, d);
        if (nc < 0 || dist[nc] >= 0 || g.solidAt(nc) || (risky[nc] && qi > 0)) continue;
        if (g.m.arrow && g.arrow[nc] === (d + 2) % 4) continue;
        const t = dist[c] + 1;
        if (freeAt[nc] > t) continue;
        if (tailHalf[nc]) reachBody = true; // we can follow our own tail out
        dist[nc] = t; count++; q.push(nc);
        if (t > far) far = t;
      }
    }
    return { count, reachBody, far, need: me.cells.length + me.grow };
  }

  function isSafe(g, lenient) {
    if (g.won) return true;
    for (let si = 0; si < g.snakes.length; si++) {
      const f = flood(g, si);
      const ok = lenient ? (f.reachBody || f.count >= f.need * 0.5) : (f.reachBody || f.count >= f.need);
      if (!ok) return false;
    }
    return true;
  }

  // No safe apple right now: stall in the way that keeps the most room
  function survive(game) {
    const sn = game.snakes[0];
    let best = sn.dir, bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      if (d === (sn.dir + 2) % 4) continue;
      const g2 = game.clone();
      g2.step(g2.inputFor(d));
      if (g2.over && !g2.won) continue;
      if (g2.won) return d;
      let score = Infinity;
      for (let si = 0; si < g2.snakes.length; si++) {
        const f = flood(g2, si);
        score = Math.min(score, (f.reachBody ? game.n * 2 : 0) + f.count + f.far * 0.01);
      }
      score += Math.random() * 0.005; // break ties so it doesn't circle forever
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  const progressGoal = (g2, g) => g2.progress > g.progress;
  const relocateGoal = (g2, g) => g2.relocations > g.relocations;

  // Breadth-first search over simulated futures; returns the first move toward the goal
  function plan(game, goal, lenient) {
    const seen = new Uint8Array(game.n * 4);
    const limit = game.n * 4;
    let frontier = [{ g: game, first: -1 }], nodes = 0;
    while (frontier.length) {
      const next = [];
      for (const node of frontier) {
        const sn = node.g.snakes[0];
        for (let d = 0; d < 4; d++) {
          if (d === (sn.dir + 2) % 4) continue;
          const g2 = node.g.clone();
          g2.step(g2.inputFor(d));
          if (g2.over && !g2.won) continue;
          const first = node.first < 0 ? d : node.first;
          if (g2.won) return first;
          if (g2.poisonEaten > game.poisonEaten) continue;
          // Check the goal first: eating can teleport or flip the head onto a visited spot
          if (goal(g2, game)) {
            if (isSafe(g2, lenient)) return first;
            continue;
          }
          const s2 = g2.snakes[0], key = s2.cells[0] * 4 + s2.dir;
          if (seen[key]) continue;
          seen[key] = 1;
          if (++nodes > limit) return -1;
          next.push({ g: g2, first });
        }
      }
      frontier = next;
    }
    return -1;
  }

  // Sokoban: find a series of pushes that gets a crate onto a target
  function sokobanPlan(game) {
    const sn = game.snakes[0], n = game.n, head = sn.cells[0];
    const body = new Uint8Array(n);
    for (const s of game.snakes) for (let i = 0; i < s.cells.length - 1; i++) body[s.cells[i]] = 1;
    const crateAt = new Uint8Array(n);
    for (const c of game.crates) crateAt[c] = 1;
    const isTarget = new Uint8Array(n);
    for (const c of game.targets) isTarget[c] = 1;
    const blocked = c => game.solidAt(c) || body[c] || crateAt[c];

    function reach(from, crate) {
      const prev = new Int32Array(n).fill(-2);
      prev[from] = -1;
      const q = [from];
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        for (let d = 0; d < 4; d++) {
          const nc = game.neighbor(c, d);
          if (nc < 0 || prev[nc] !== -2 || nc === crate || (blocked(nc) && nc !== crate)) continue;
          prev[nc] = c; q.push(nc);
        }
      }
      return prev;
    }

    let bestFirst = -1, bestLen = Infinity;
    for (const crate of game.crates) {
      crateAt[crate] = 0;
      // state: crate position + where the head is after the last push
      const seen = new Map();
      const startPrev = reach(head, crate);
      let frontier = [{ p: crate, h: head, prev: startPrev, first: -1, len: 0 }];
      seen.set(crate * n + head, 1);
      let found = null;
      while (frontier.length && !found) {
        const next = [];
        for (const st of frontier) {
          for (let pd = 0; pd < 4; pd++) {
            const behind = game.neighbor(st.p, (pd + 2) % 4);
            const dest = game.neighbor(st.p, pd);
            if (behind < 0 || dest < 0) continue;
            if (blocked(dest) || (body[dest])) continue;
            if (st.prev[behind] === -2 && behind !== st.h) continue;
            // length of walk to get behind the crate
            let walk = 0, c = behind, firstStep = pd;
            if (behind !== st.h) {
              while (st.prev[c] !== st.h && st.prev[c] >= 0) { c = st.prev[c]; walk++; }
              walk++;
              firstStep = game.dirBetween(st.h, c, -1);
            }
            const first = st.first < 0 ? firstStep : st.first;
            if (first < 0) continue;
            const len = st.len + walk + 1;
            if (isTarget[dest]) { if (len < (found ? found.len : Infinity)) found = { first, len }; continue; }
            const key = dest * n + st.p;
            if (seen.has(key)) continue;
            seen.set(key, 1);
            next.push({ p: dest, h: st.p, prev: reach(st.p, dest), first, len });
          }
        }
        frontier = next;
      }
      crateAt[crate] = 1;
      if (found && found.len < bestLen) { bestLen = found.len; bestFirst = found.first; }
    }
    if (bestFirst < 0) return -1;
    if (bestFirst === (sn.dir + 2) % 4) return -1;
    const g2 = game.clone();
    g2.step(g2.inputFor(bestFirst));
    if (g2.over && !g2.won) return -1;
    return bestFirst;
  }

  class SearchAI {
    constructor(game, risky) {
      this.risky = risky;
      this.guaranteed = false;
    }
    decide(game) {
      const sn = game.snakes[0];
      let d = -1;
      const hasEdible = game.apples.some(a => game.canEat(sn, a));
      if (game.m.sokoban && !hasEdible) d = sokobanPlan(game);
      // Stuck for ages? Accept riskier apples rather than circling forever
      const stuck = game.sinceEat > game.n * 3;
      // The speedrunner takes risks while short, then plays it safer as the board fills
      const bold = this.risky && sn.cells.length < game.n * 0.3;
      if (d < 0) d = plan(game, progressGoal, bold || stuck);
      if (d < 0 && game.m.sokoban) d = plan(game, relocateGoal, true);
      if (d < 0) d = survive(game);
      return game.inputFor(d);
    }
  }

  function createAI(kind, game) {
    if (kind === 'perfect' && cycleCompatible(game)) return new CycleAI(game);
    return new SearchAI(game, kind !== 'perfect');
  }

  const api = { createAI, buildCycle, cycleCompatible, flood, survive, CycleAI, SearchAI };
  root.SnakeAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
