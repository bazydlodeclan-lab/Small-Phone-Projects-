/* The Solitaire AI that teaches itself (reinforcement learning, Deep Q-Learning).
   Each turn it looks at every legal move, rates each one with its neural network,
   and picks the best (or a random one while it is still exploring).
   Rewards you choose tell it which results are good or bad. */
(function (root) {
  'use strict';
  const S = root.SolEngine || require('./engine.js');
  const { rank } = S;

  // ---------- A small neural network (the AI's "brain") ----------
  class Net {
    constructor(sizes) {
      this.sizes = sizes.slice();
      this.W = []; this.b = []; this.mW = []; this.vW = []; this.mb = []; this.vb = [];
      for (let l = 0; l < sizes.length - 1; l++) {
        const nin = sizes[l], nout = sizes[l + 1];
        const w = new Float32Array(nin * nout), sd = Math.sqrt(2 / nin);
        for (let i = 0; i < w.length; i++) w[i] = gauss() * sd;
        this.W.push(w); this.b.push(new Float32Array(nout));
        this.mW.push(new Float32Array(w.length)); this.vW.push(new Float32Array(w.length));
        this.mb.push(new Float32Array(nout)); this.vb.push(new Float32Array(nout));
      }
      this.t = 0;
    }
    forward(x) {
      const acts = [x];
      let a = x;
      for (let l = 0; l < this.W.length; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1], W = this.W[l], b = this.b[l];
        const out = new Float32Array(nout);
        for (let j = 0; j < nout; j++) {
          let s = b[j];
          const off = j * nin;
          for (let i = 0; i < nin; i++) s += W[off + i] * a[i];
          out[j] = (l < this.W.length - 1 && s < 0) ? 0 : s;
        }
        acts.push(out); a = out;
      }
      return acts;
    }
    value(x) { const a = this.forward(x); return a[a.length - 1][0]; }
    train(xs, targets, lr) {
      const L = this.W.length;
      const gW = this.W.map(w => new Float32Array(w.length)), gb = this.b.map(b => new Float32Array(b.length));
      let loss = 0;
      for (let k = 0; k < xs.length; k++) {
        const acts = this.forward(xs[k]);
        let err = acts[L][0] - targets[k];
        loss += err * err;
        err = Math.max(-1, Math.min(1, err));
        let delta = Float32Array.of(err);
        for (let l = L - 1; l >= 0; l--) {
          const nin = this.sizes[l], nout = this.sizes[l + 1], a = acts[l], W = this.W[l];
          const prev = new Float32Array(nin);
          for (let j = 0; j < nout; j++) {
            const dj = delta[j];
            if (dj === 0) continue;
            gb[l][j] += dj;
            const off = j * nin;
            for (let i = 0; i < nin; i++) { gW[l][off + i] += dj * a[i]; prev[i] += dj * W[off + i]; }
          }
          if (l > 0) for (let i = 0; i < nin; i++) if (a[i] <= 0) prev[i] = 0;
          delta = prev;
        }
      }
      this.t++;
      const b1 = 0.9, b2 = 0.999, n = xs.length, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
      const upd = (p, g, m, v) => {
        for (let i = 0; i < p.length; i++) {
          const gi = g[i] / n;
          m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
        }
      };
      for (let l = 0; l < L; l++) { upd(this.W[l], gW[l], this.mW[l], this.vW[l]); upd(this.b[l], gb[l], this.mb[l], this.vb[l]); }
      return loss / n;
    }
    copyFrom(o) { for (let l = 0; l < this.W.length; l++) { this.W[l].set(o.W[l]); this.b[l].set(o.b[l]); } }
    toJSON() { return { sizes: this.sizes, W: this.W.map(w => Array.from(w)), b: this.b.map(b => Array.from(b)) }; }
    static fromJSON(j) { const n = new Net(j.sizes); j.W.forEach((w, l) => n.W[l].set(w)); j.b.forEach((b, l) => n.b[l].set(b)); return n; }
  }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- Settings the user can change ----------
  const DEFAULTS = {
    rewards: { home: 5, reveal: 5, fromHome: -5, wasteToTable: 1, move: -0.1, recycle: -2, win: 100, stuck: -10 },
    vision: { moveType: true, reveals: true, cardInfo: true, table: true, progress: true },
    brain: { hidden: 48, layers: 1 },
    learn: { lr: 0.002, gamma: 0.95, epsStart: 1, epsEnd: 0.03, epsEpisodes: 300, batch: 16, memory: 30000, targetSync: 300, stuckAfter: 80 },
  };
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- What the AI "sees" about a move ----------
  function featureCount(v) {
    return (v.moveType ? 6 : 0) + (v.reveals ? 3 : 0) + (v.cardInfo ? 3 : 0) + (v.table ? 4 : 0) + (v.progress ? 2 : 0) || 1;
  }

  function moveFeatures(g, m, v) {
    const out = [];
    if (v.moveType) { const o = [0, 0, 0, 0, 0, 0]; o[S.TYPES.indexOf(m.t)] = 1; out.push(...o); }
    let card = -1, count = 1;
    if (m.t === 'w2f' || m.t === 'w2t') card = g.waste[g.waste.length - 1];
    else if (m.t === 't2f') card = g.tab[m.from][g.tab[m.from].length - 1];
    else if (m.t === 't2t') { card = g.tab[m.from][m.idx]; count = g.tab[m.from].length - m.idx; }
    else if (m.t === 'f2t') card = g.found[m.from][g.found[m.from].length - 1];
    if (v.reveals) {
      const fromTab = m.t === 't2f' || m.t === 't2t';
      const startIdx = m.t === 't2f' ? g.tab[m.from].length - 1 : m.idx;
      const reveals = fromTab && startIdx === g.down[m.from] && g.down[m.from] > 0;
      const empties = fromTab && startIdx === 0;
      out.push(reveals ? 1 : 0, empties ? 1 : 0, fromTab ? g.down[m.from] / 6 : 0);
    }
    if (v.cardInfo) out.push(card >= 0 ? rank(card) / 12 : 0, count / 13, (m.to != null && m.t !== 'f2t' && !g.tab[m.to].length) || (m.t === 'f2t' && !g.tab[m.to].length) ? 1 : 0);
    if (v.table) out.push(g.stock.length / 24, g.waste.length / 24, g.downCount() / 21, g.tab.filter(c => !c.length).length / 7);
    if (v.progress) out.push(g.foundCount() / 52, Math.min(1, g.recycles / 10));
    if (!out.length) out.push(0);
    return Float32Array.from(out);
  }

  // ---------- The learner ----------
  class Agent {
    constructor(cfg) {
      this.cfg = clone(cfg);
      const sizes = [featureCount(cfg.vision)];
      for (let i = 0; i < cfg.brain.layers; i++) sizes.push(cfg.brain.hidden);
      sizes.push(1);
      this.net = new Net(sizes); this.target = new Net(sizes); this.target.copyFrom(this.net);
      this.mem = []; this.memPos = 0; this.steps = 0;
    }
    pick(feats, eps) {
      if (Math.random() < eps) return Math.floor(Math.random() * feats.length);
      let best = 0, bv = -Infinity;
      for (let i = 0; i < feats.length; i++) { const q = this.net.value(feats[i]); if (q > bv) { bv = q; best = i; } }
      return best;
    }
    remember(x, r, next, done) {
      const item = { x, r, next, done };
      const cap = this.cfg.learn.memory;
      if (this.mem.length < cap) this.mem.push(item); else { this.mem[this.memPos] = item; this.memPos = (this.memPos + 1) % cap; }
    }
    learn() {
      const L = this.cfg.learn;
      if (this.mem.length < L.batch) return;
      const xs = [], ts = [];
      for (let k = 0; k < L.batch; k++) {
        const m = this.mem[Math.floor(Math.random() * this.mem.length)];
        let t = m.r;
        if (!m.done && m.next.length) {
          let mx = -Infinity;
          for (const f of m.next) { const q = this.target.value(f); if (q > mx) mx = q; }
          t += L.gamma * mx;
        }
        xs.push(m.x); ts.push(t);
      }
      this.net.train(xs, ts, L.lr);
      if (++this.steps % L.targetSync === 0) this.target.copyFrom(this.net);
    }
    toJSON() { return { cfg: this.cfg, net: this.net.toJSON(), steps: this.steps }; }
    static fromJSON(j) { const a = new Agent(j.cfg); a.net = Net.fromJSON(j.net); a.target.copyFrom(a.net); a.steps = j.steps || 0; return a; }
  }

  // ---------- Runs attempts one move at a time ----------
  class Trainer {
    constructor(cfg, gameCfg) {
      this.cfg = clone(cfg);
      this.gameCfg = Object.assign({}, gameCfg);
      this.agent = new Agent(this.cfg);
      this.episodes = []; this.best = 0; this.wins = 0; this.totalMoves = 0;
      this.startEpisode();
    }
    epsilon() {
      const L = this.cfg.learn, e = this.episodes.length;
      return e >= L.epsEpisodes ? L.epsEnd : L.epsStart + (L.epsEnd - L.epsStart) * (e / L.epsEpisodes);
    }
    startEpisode() {
      this.epCfg = Object.assign({}, this.gameCfg);
      this.seed = (Math.random() * 2 ** 31) | 0;
      this.game = new S.Game({ draw: this.epCfg.draw, seed: this.seed });
      this.moves = []; this.epReward = 0; this.sinceProgress = 0;
      this.options = this.game.legalMoves();
      this.feats = this.options.map(m => moveFeatures(this.game, m, this.cfg.vision));
    }
    tick() {
      const g = this.game, R = this.cfg.rewards, L = this.cfg.learn;
      const i = this.agent.pick(this.feats, this.epsilon());
      const m = this.options[i], x = this.feats[i];
      const ev = g.apply(m);
      this.moves.push(S.encode(m)); this.totalMoves++;
      let r = R.move;
      if (ev.toFound) r += R.home;
      if (ev.flipped) r += R.reveal;
      if (ev.fromFound) r += R.fromHome;
      if (ev.wasteToTab) r += R.wasteToTable;
      if (ev.recycled) r += R.recycle;
      if (ev.toFound || ev.flipped) this.sinceProgress = 0; else this.sinceProgress++;
      let done = false, why = '';
      if (g.won()) { done = true; r += R.win; why = 'Won!'; }
      else if (this.sinceProgress >= L.stuckAfter) { done = true; r += R.stuck; why = 'Got stuck'; }
      else if (g.moves >= 500) { done = true; r += R.stuck; why = 'Too many moves'; }
      const nextOpts = done ? [] : g.legalMoves();
      const nextFeats = nextOpts.map(mm => moveFeatures(g, mm, this.cfg.vision));
      if (!done && !nextOpts.length) { done = true; why = 'No moves left'; r += R.stuck; }
      this.agent.remember(x, r, nextFeats, done);
      this.agent.learn();
      this.epReward += r;
      this.options = nextOpts; this.feats = nextFeats;
      if (!done) return null;
      const ep = {
        n: this.episodes.length + 1, home: g.foundCount(), won: g.won(), steps: g.moves, reward: Math.round(this.epReward * 10) / 10,
        reason: why, seed: this.seed, cfg: this.epCfg, moves: this.moves,
      };
      this.episodes.push(ep);
      if (ep.won) this.wins++;
      if (ep.home > this.best) this.best = ep.home;
      if (this.episodes.length > 3000) { const old = this.episodes[this.episodes.length - 3001]; if (!old.won && old.home < this.best) old.moves = null; }
      this.startEpisode();
      return ep;
    }
  }

  const api = { Net, Agent, Trainer, DEFAULTS, clone, moveFeatures, featureCount };
  root.SolRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
