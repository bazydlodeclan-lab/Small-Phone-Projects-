/* Klondike Solitaire rules (the game Google Solitaire uses).
   Works in the browser (window.SolEngine) and in Node (for the tests). */
(function (root) {
  'use strict';

  // Cards are numbers 0-51. suit = card / 13 (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank = card % 13 (0 = ace, 12 = king)
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suit = c => (c / 13) | 0;
  const rank = c => c % 13;
  const red = c => { const s = suit(c); return s === 1 || s === 2; };
  const name = c => RANKS[rank(c)] + SUITS[suit(c)];

  // Scoring (Windows "Standard" scoring; Google's exact numbers are not published)
  const SCORE = { wasteToTab: 5, toFound: 10, flip: 5, fromFound: -15, recycle1: -100, recycle3: -20 };

  function rng(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Game {
    constructor(cfg) {
      cfg = cfg || {};
      this.draw = cfg.draw === 3 ? 3 : 1;
      this.seed = cfg.seed == null ? (Math.random() * 2 ** 31) | 0 : cfg.seed;
      const r = rng(this.seed);
      const deck = [];
      for (let i = 0; i < 52; i++) deck.push(i);
      for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      this.tab = [];   // 7 columns, bottom card first
      this.down = [];  // how many cards at the bottom of each column are face down
      let k = 0;
      for (let i = 0; i < 7; i++) {
        this.tab.push(deck.slice(k, k + i + 1)); k += i + 1;
        this.down.push(i);
      }
      this.stock = deck.slice(k); // top of the stock is the last card
      this.waste = [];            // top of the waste is the last card
      this.found = [[], [], [], []]; // one pile per suit
      this.score = 0; this.moves = 0; this.recycles = 0;
      this.seen = new Uint8Array(52); // cards that have been face up at some point
      for (let i = 0; i < 7; i++) this.seen[this.tab[i][i]] = 1;
      this.history = [];
    }

    clone(withHistory) {
      const o = Object.create(Game.prototype);
      o.draw = this.draw; o.seed = this.seed;
      o.tab = this.tab.map(c => c.slice()); o.down = this.down.slice();
      o.stock = this.stock.slice(); o.waste = this.waste.slice();
      o.found = this.found.map(f => f.slice());
      o.score = this.score; o.moves = this.moves; o.recycles = this.recycles;
      o.seen = this.seen.slice();
      o.history = withHistory ? this.history.slice() : [];
      return o;
    }

    foundCount() { return this.found[0].length + this.found[1].length + this.found[2].length + this.found[3].length; }
    won() { return this.foundCount() === 52; }
    downCount() { return this.down.reduce((a, b) => a + b, 0); }

    canFound(c) { return this.found[suit(c)].length === rank(c); }
    canStackOn(c, col) {
      const t = this.tab[col];
      if (!t.length) return rank(c) === 12;
      const top = t[t.length - 1];
      return rank(top) === rank(c) + 1 && red(top) !== red(c);
    }

    // Every move the rules allow right now
    legalMoves() {
      const out = [];
      if (this.stock.length || this.waste.length) out.push({ t: 'draw' });
      if (this.waste.length) {
        const w = this.waste[this.waste.length - 1];
        if (this.canFound(w)) out.push({ t: 'w2f' });
        for (let j = 0; j < 7; j++) if (this.canStackOn(w, j)) out.push({ t: 'w2t', to: j });
      }
      for (let i = 0; i < 7; i++) {
        const col = this.tab[i];
        if (!col.length) continue;
        if (this.canFound(col[col.length - 1])) out.push({ t: 't2f', from: i });
        for (let idx = this.down[i]; idx < col.length; idx++) {
          const c = col[idx];
          for (let j = 0; j < 7; j++) {
            if (j === i) continue;
            if (!this.tab[j].length && idx === 0) continue; // king already at the bottom: pointless
            if (this.canStackOn(c, j)) out.push({ t: 't2t', from: i, idx, to: j });
          }
        }
      }
      for (let f = 0; f < 4; f++) {
        const p = this.found[f];
        if (!p.length) continue;
        const c = p[p.length - 1];
        for (let j = 0; j < 7; j++) if (this.canStackOn(c, j)) out.push({ t: 'f2t', from: f, to: j });
      }
      return out;
    }

    isLegal(m) { return this.legalMoves().some(x => sameMove(x, m)); }

    // Do a move. Returns what happened (for rewards and animations).
    apply(m, keepHistory) {
      if (keepHistory) this.history.push(this.snapshot());
      const ev = { flipped: false, toFound: 0, fromFound: 0, recycled: false, wasteToTab: false };
      const flip = i => {
        const col = this.tab[i];
        if (col.length && this.down[i] >= col.length) {
          this.down[i] = col.length - 1;
          this.seen[col[col.length - 1]] = 1;
          this.score += SCORE.flip; ev.flipped = true;
        }
      };
      switch (m.t) {
        case 'draw':
          if (this.stock.length) {
            for (let k = 0; k < this.draw && this.stock.length; k++) {
              const c = this.stock.pop(); this.waste.push(c); this.seen[c] = 1;
            }
          } else {
            this.stock = this.waste.reverse(); this.waste = [];
            this.recycles++; ev.recycled = true;
            if (this.draw === 1) this.score += SCORE.recycle1;
            else if (this.recycles > 3) this.score += SCORE.recycle3;
          }
          break;
        case 'w2f': { const c = this.waste.pop(); this.found[suit(c)].push(c); this.score += SCORE.toFound; ev.toFound = 1; break; }
        case 'w2t': { const c = this.waste.pop(); this.tab[m.to].push(c); this.score += SCORE.wasteToTab; ev.wasteToTab = true; break; }
        case 't2f': { const c = this.tab[m.from].pop(); this.found[suit(c)].push(c); this.score += SCORE.toFound; ev.toFound = 1; flip(m.from); break; }
        case 't2t': {
          const moved = this.tab[m.from].splice(m.idx);
          this.tab[m.to].push(...moved);
          flip(m.from);
          break;
        }
        case 'f2t': { const c = this.found[m.from].pop(); this.tab[m.to].push(c); this.score += SCORE.fromFound; ev.fromFound = 1; break; }
      }
      if (this.score < 0) this.score = 0;
      this.moves++;
      return ev;
    }

    snapshot() {
      return { tab: this.tab.map(c => c.slice()), down: this.down.slice(), stock: this.stock.slice(), waste: this.waste.slice(),
        found: this.found.map(f => f.slice()), score: this.score, moves: this.moves, recycles: this.recycles };
    }

    undo() {
      const s = this.history.pop();
      if (!s) return false;
      Object.assign(this, s);
      return true;
    }

    // Can the rest be finished by just moving cards up? (everything face up, stock empty)
    canAutoFinish() { return !this.stock.length && !this.waste.length && this.downCount() === 0 && !this.won(); }

    // A string that identifies the position (used by the solver)
    key() {
      let s = '';
      for (let i = 0; i < 7; i++) s += this.down[i] + ':' + this.tab[i].join(',') + '|';
      s += this.found.map(f => f.length).join(',') + '|' + this.stock.join(',') + '/' + this.waste.join(',');
      return s;
    }
  }

  function sameMove(a, b) {
    return a.t === b.t && a.from === b.from && a.to === b.to && a.idx === b.idx;
  }

  // Compact form so attempts can be stored and replayed
  const TYPES = ['draw', 'w2f', 'w2t', 't2f', 't2t', 'f2t'];
  function encode(m) { return [TYPES.indexOf(m.t), m.from == null ? -1 : m.from, m.to == null ? -1 : m.to, m.idx == null ? -1 : m.idx]; }
  function decode(a) {
    const m = { t: TYPES[a[0]] };
    if (a[1] >= 0) m.from = a[1];
    if (a[2] >= 0) m.to = a[2];
    if (a[3] >= 0) m.idx = a[3];
    return m;
  }

  const api = { Game, SUITS, RANKS, SCORE, suit, rank, red, name, sameMove, encode, decode, TYPES };
  root.SolEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
