/* The AI that teaches itself (reinforcement learning, "Deep Q-Learning").
   It starts knowing nothing, tries moves, gets rewards or punishments,
   and slowly learns which moves lead to more reward. */
(function (root) {
  'use strict';
  const E = root.SnakeEngine || require('./engine.js');
  const AI = root.SnakeAI || require('./ai.js');

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

    // Run the network; keeps every layer's values so it can learn from them
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
          out[j] = (l < this.W.length - 1 && s < 0) ? 0 : s; // ReLU on hidden layers
        }
        acts.push(out); a = out;
      }
      return acts;
    }

    predict(x) { const a = this.forward(x); return a[a.length - 1]; }

    // Learn from a batch: nudge Q(state, action) toward its target value
    train(states, actions, targets, lr) {
      const L = this.W.length;
      const gW = this.W.map(w => new Float32Array(w.length));
      const gb = this.b.map(b => new Float32Array(b.length));
      let loss = 0;
      for (let k = 0; k < states.length; k++) {
        const acts = this.forward(states[k]);
        const out = acts[L];
        let err = out[actions[k]] - targets[k];
        loss += err * err;
        err = Math.max(-1, Math.min(1, err)); // Huber-style clipping keeps learning stable
        let delta = new Float32Array(out.length);
        delta[actions[k]] = err;
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
      // Adam optimiser
      this.t++;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8, n = states.length;
      const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
      const upd = (p, g, m, v) => {
        for (let i = 0; i < p.length; i++) {
          const gi = g[i] / n;
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps);
        }
      };
      for (let l = 0; l < L; l++) { upd(this.W[l], gW[l], this.mW[l], this.vW[l]); upd(this.b[l], gb[l], this.mb[l], this.vb[l]); }
      return loss / n;
    }

    copyFrom(o) { for (let l = 0; l < this.W.length; l++) { this.W[l].set(o.W[l]); this.b[l].set(o.b[l]); } }

    toJSON() { return { sizes: this.sizes, W: this.W.map(w => Array.from(w)), b: this.b.map(b => Array.from(b)) }; }
    static fromJSON(j) {
      const n = new Net(j.sizes);
      j.W.forEach((w, l) => n.W[l].set(w)); j.b.forEach((b, l) => n.b[l].set(b));
      return n;
    }
  }

  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- Default settings the user can change ----------
  const DEFAULTS = {
    rewards: { eat: 10, die: -10, win: 100, closer: 0.1, farther: -0.15, step: 0, timeout: -10 },
    vision: { danger: true, space: true, food: true, direction: false, tail: false, length: false },
    actions: 'relative', // 'relative' = straight/left/right, 'absolute' = up/down/left/right
    brain: { hidden: 128, layers: 1 },
    learn: { lr: 0.001, gamma: 0.95, epsStart: 1, epsEnd: 0.01, epsEpisodes: 300, batch: 32, memory: 50000, targetSync: 500 },
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- What the AI "sees" each move ----------
  function actionDirs(game, actions) {
    const d = game.snakes[0].dir;
    return actions === 'relative' ? [d, (d + 1) % 4, (d + 3) % 4] : [0, 1, 2, 3];
  }

  function nearestTarget(game) {
    const sn = game.snakes[0], h = sn.cells[0];
    const [hx, hy] = game.xy(h);
    const list = [];
    for (const a of game.apples) if (game.canEat(sn, a)) list.push(a.c);
    if (!list.length) for (const k of game.keys) list.push(k.c);
    if (!list.length) for (const c of game.crates) list.push(c);
    let best = -1, bd = Infinity;
    for (const c of list) {
      const [x, y] = game.xy(c), d = Math.abs(x - hx) + Math.abs(y - hy);
      if (d < bd) { bd = d; best = c; }
    }
    return { c: best, d: bd };
  }

  // Four yes/no values: is the point ahead / right / behind / left of me (or up/right/down/left)
  function compass(game, c, relative) {
    const out = [0, 0, 0, 0];
    if (c < 0) return out;
    const [hx, hy] = game.xy(game.snakes[0].cells[0]);
    const [x, y] = game.xy(c);
    const dir = game.snakes[0].dir;
    const abs = [y < hy, x > hx, y > hy, x < hx]; // up right down left
    for (let i = 0; i < 4; i++) out[i] = abs[relative ? (dir + i) % 4 : i] ? 1 : 0;
    return out;
  }

  function featureCount(cfg) {
    const A = cfg.actions === 'relative' ? 3 : 4, v = cfg.vision;
    return (v.danger ? A : 0) + (v.space ? A : 0) + (v.food ? 4 : 0) + (v.direction ? 4 : 0) + (v.tail ? 4 : 0) + (v.length ? 1 : 0) || 1;
  }

  function features(game, cfg) {
    const v = cfg.vision, rel = cfg.actions === 'relative', out = [];
    const dirs = actionDirs(game, cfg.actions);
    if (v.danger || v.space) {
      const danger = [], space = [];
      for (const d of dirs) {
        const g2 = game.clone();
        g2.step(d);
        const dead = g2.over && !g2.won;
        danger.push(dead ? 1 : 0);
        if (v.space) space.push(dead ? 0 : (g2.won ? 1 : Math.min(1, AI.flood(g2).count / Math.max(1, g2.snakes[0].cells.length * 2))));
      }
      if (v.danger) out.push(...danger);
      if (v.space) out.push(...space);
    }
    if (v.food) out.push(...compass(game, nearestTarget(game).c, rel));
    if (v.direction) { const o = [0, 0, 0, 0]; o[game.snakes[0].dir] = 1; out.push(...o); }
    if (v.tail) { const sn = game.snakes[0]; out.push(...compass(game, sn.cells[sn.cells.length - 1], rel)); }
    if (v.length) out.push(game.snakes[0].cells.length / game.n);
    if (!out.length) out.push(0);
    return Float32Array.from(out);
  }

  // ---------- The learner ----------
  class Agent {
    constructor(cfg) {
      this.cfg = clone(cfg);
      const nIn = featureCount(cfg), nOut = cfg.actions === 'relative' ? 3 : 4;
      const sizes = [nIn];
      for (let i = 0; i < cfg.brain.layers; i++) sizes.push(cfg.brain.hidden);
      sizes.push(nOut);
      this.net = new Net(sizes);
      this.target = new Net(sizes);
      this.target.copyFrom(this.net);
      this.mem = []; this.memPos = 0; this.learnSteps = 0; this.lastLoss = 0;
    }

    act(state, eps) {
      const nOut = this.net.sizes[this.net.sizes.length - 1];
      if (Math.random() < eps) return Math.floor(Math.random() * nOut);
      const q = this.net.predict(state);
      let best = 0;
      for (let i = 1; i < q.length; i++) if (q[i] > q[best]) best = i;
      return best;
    }

    remember(s, a, r, s2, done) {
      const item = { s, a, r, s2, done };
      if (this.mem.length < this.cfg.learn.memory) this.mem.push(item);
      else { this.mem[this.memPos] = item; this.memPos = (this.memPos + 1) % this.cfg.learn.memory; }
    }

    learn() {
      const L = this.cfg.learn;
      if (this.mem.length < L.batch) return;
      const S = [], A = [], T = [];
      for (let k = 0; k < L.batch; k++) {
        const m = this.mem[Math.floor(Math.random() * this.mem.length)];
        let t = m.r;
        if (!m.done) { const q2 = this.target.predict(m.s2); let mx = q2[0]; for (let i = 1; i < q2.length; i++) if (q2[i] > mx) mx = q2[i]; t += L.gamma * mx; }
        S.push(m.s); A.push(m.a); T.push(t);
      }
      this.lastLoss = this.net.train(S, A, T, L.lr);
      if (++this.learnSteps % L.targetSync === 0) this.target.copyFrom(this.net);
    }

    toJSON() { return { cfg: this.cfg, net: this.net.toJSON(), learnSteps: this.learnSteps }; }
    static fromJSON(j) {
      const a = new Agent(j.cfg);
      a.net = Net.fromJSON(j.net);
      a.target.copyFrom(a.net);
      a.learnSteps = j.learnSteps || 0;
      return a;
    }
  }

  // ---------- Runs attempts (episodes) one move at a time ----------
  class Trainer {
    constructor(cfg, gameCfg) {
      this.cfg = clone(cfg);
      this.gameCfg = Object.assign({}, gameCfg);
      this.agent = new Agent(this.cfg);
      this.episodes = [];
      this.best = 0;
      this.totalSteps = 0;
      this.startEpisode();
    }

    epsilon() {
      const L = this.cfg.learn, e = this.episodes.length;
      if (e >= L.epsEpisodes) return L.epsEnd;
      return L.epsStart + (L.epsEnd - L.epsStart) * (e / L.epsEpisodes);
    }

    startEpisode() {
      const seed = (Math.random() * 2 ** 31) | 0;
      this.epCfg = Object.assign({}, this.gameCfg);
      this.game = new E.Game(Object.assign({}, this.epCfg, { seed }));
      this.seed = seed;
      this.moves = [];
      this.epReward = 0;
      this.state = features(this.game, this.cfg);
    }

    // One move: look, choose, act, get reward, learn. Returns the finished episode or null.
    tick() {
      const g = this.game, R = this.cfg.rewards, sn = g.snakes[0];
      const before = nearestTarget(g).d, score = g.score, progress = g.progress;
      const a = this.agent.act(this.state, this.epsilon());
      const dir = actionDirs(g, this.cfg.actions)[a];
      g.step(dir);
      this.moves.push(dir);
      this.totalSteps++;
      let r = R.step, done = false, timedOut = false;
      if (g.over) {
        done = true;
        r += g.won ? R.win : R.die;
      } else {
        if (g.score > score) r += R.eat * (g.score - score);
        else if (g.progress > progress) r += R.eat * 0.5;
        else {
          const after = nearestTarget(g).d;
          if (isFinite(after) && isFinite(before)) r += after < before ? R.closer : (after > before ? R.farther : 0);
        }
        if (g.sinceEat > Math.max(100, g.n) + sn.cells.length) { done = true; timedOut = true; r += R.timeout; }
      }
      const s2 = done ? this.state : features(g, this.cfg);
      this.agent.remember(this.state, a, r, s2, done);
      this.agent.learn();
      this.state = s2;
      this.epReward += r;
      if (!done) return null;
      const ep = {
        n: this.episodes.length + 1, score: g.score, steps: g.steps, reward: Math.round(this.epReward * 10) / 10,
        eps: Math.round(this.epsilon() * 100) / 100, won: g.won,
        reason: g.won ? 'Won!' : (timedOut ? 'Went in circles (timeout)' : g.reason),
        seed: this.seed, cfg: this.epCfg, moves: Uint8Array.from(this.moves),
      };
      this.episodes.push(ep);
      if (ep.score > this.best) this.best = ep.score;
      this.trimReplays();
      this.startEpisode();
      return ep;
    }

    // Keep memory in check: very old, unremarkable attempts lose their replay
    trimReplays() {
      const eps = this.episodes;
      if (eps.length <= 3000) return;
      const old = eps[eps.length - 3001];
      if (old.moves && old.score < this.best) old.moves = null;
    }
  }

  const api = { Net, Agent, Trainer, DEFAULTS, features, featureCount, clone };
  root.SnakeRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
