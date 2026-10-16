/* Snake game rules: board, snake movement, every mode.
   Works in the browser (window.SnakeEngine) and in Node (for the tests). */
(function (root) {
  'use strict';

  // Directions: 0 = up, 1 = right, 2 = down, 3 = left
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  // Board sizes (cells wide x cells tall)
  const SIZES = {
    small: { w: 10, h: 9, label: 'Small' },
    standard: { w: 17, h: 15, label: 'Standard' },
    large: { w: 24, h: 21, label: 'Large' },
  };

  // Milliseconds per move for each speed setting
  const SPEEDS = {
    slow: { ms: 200, label: 'Slow' },
    normal: { ms: 135, label: 'Normal' },
    fast: { ms: 90, label: 'Fast' },
  };

  // Apple amount options
  const APPLE_COUNTS = [
    { id: 1, label: '1' },
    { id: 3, label: '3' },
    { id: 5, label: '5' },
    { id: 'dice', label: 'Dice' },
  ];

  // Every game mode
  const MODES = [
    { id: 'classic', name: 'Classic', desc: 'Eat apples, grow longer, do not crash.' },
    { id: 'wall', name: 'Wall', desc: 'Every apple you eat builds a brick wall somewhere.' },
    { id: 'portal', name: 'Portal', desc: 'Apples come in matching pairs. Eat one and you come out of the other.' },
    { id: 'cheese', name: 'Cheese', desc: 'Your body has holes. You can pass through the holes. Each apple adds 2 parts.' },
    { id: 'borderless', name: 'Borderless', desc: 'No edges. Leave one side, come back on the other.' },
    { id: 'twin', name: 'Twin', desc: 'Every apple swaps your head and tail.' },
    { id: 'winged', name: 'Winged', desc: 'Apples fly around and bounce off walls and your body.' },
    { id: 'yinyang', name: 'Yin Yang', desc: 'A second snake copies you in the opposite direction. Do not let them touch.' },
    { id: 'key', name: 'Key', desc: 'Apples are locked. Grab the key to unlock them. Hitting a lock kills you.' },
    { id: 'sokoban', name: 'Sokoban', desc: 'Apples are inside crates. Push a crate onto a target to open it.' },
    { id: 'poison', name: 'Poison', desc: 'Gray apples are poison. They scramble your controls for a while.' },
    { id: 'dimension', name: 'Dimension', desc: 'Each apple flips you to the other dimension. Body parts in the other dimension cannot hurt you.' },
    { id: 'minesweeper', name: 'Minesweeper', desc: 'Apples leave mines. Stay near a mine 4 moves and you explode.' },
    { id: 'statue', name: 'Statue', desc: 'Eating turns your body into a stone statue you must avoid.' },
    { id: 'light', name: 'Light', desc: 'The board is dark. Only the area around your head is lit.' },
    { id: 'shield', name: 'Shield', desc: 'Apples are guarded by 1 to 3 shields. Come in from an open side.' },
    { id: 'arrow', name: 'Arrow', desc: 'Every turn leaves an arrow. Step there again and you must turn the same way.' },
    { id: 'hotdog', name: 'Hotdog', desc: 'Turning puts buns next to your head, so you cannot turn twice in a row.' },
    { id: 'magnet', name: 'Magnet', desc: 'Apples slide toward your head.' },
    { id: 'gate', name: 'Gate', desc: 'Odd apples make a gate. Go through it and you get shifted over by one.' },
    { id: 'peaceful', name: 'Peaceful', desc: 'You cannot die from edges or your own body.' },
  ];

  // Modes whose rules are based on fan descriptions and may not match Google exactly
  const APPROXIMATE_MODES = ['winged', 'yinyang', 'key', 'sokoban', 'poison', 'dimension',
    'minesweeper', 'statue', 'shield', 'arrow', 'hotdog', 'magnet', 'gate'];

  const SPAWN_RADIUS = 3; // dangerous things never appear this close to a head

  // Small seeded random number generator so games can be replayed exactly
  function rand(r) {
    let a = (r.s = (r.s + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(r, n) { return Math.floor(rand(r) * n); }

  class Game {
    constructor(cfg) {
      this.cfg = {
        size: cfg.size || 'standard',
        apples: cfg.apples || 1,
        speed: cfg.speed || 'normal',
        modes: (cfg.modes && cfg.modes.length ? cfg.modes.slice() : ['classic']),
        seed: (cfg.seed == null ? (Math.random() * 2 ** 31) | 0 : cfg.seed),
      };
      const sz = SIZES[this.cfg.size];
      this.w = sz.w; this.h = sz.h; this.n = sz.w * sz.h;
      const m = {};
      for (const id of this.cfg.modes) m[id] = true;
      m.wrap = !!(m.borderless || m.peaceful);
      this.m = m;
      this.g = m.cheese ? 2 : 1; // body parts added per apple
      this.rng = { s: this.cfg.seed | 0 };
      this.reset();
    }

    reset() {
      const w = this.w, h = this.h, n = this.n;
      this.score = 0; this.progress = 0; this.steps = 0; this.sinceEat = 0;
      this.over = false; this.won = false; this.reason = '';
      this.serial = 1; this.idc = 1; this.pairc = 1; this.eatenTotal = 0;
      this.poisonEaten = 0; this.relocations = 0;
      this.apples = [];   // {id, c, pair, dim, locked, vx, vy}
      this.poisons = [];  // cells
      this.keys = [];     // {c, aid}
      this.crates = [];   // cells
      this.targets = [];  // cells
      this.mines = [];    // cells
      this.gates = [];    // {a1, b1, a2, b2}
      this.buns = [];     // {c, anchor}
      this.wall = new Uint8Array(n);
      this.bun = new Uint8Array(n);
      this.statue = new Uint8Array(n);
      this.shield = new Uint8Array(n);
      this.arrow = new Int8Array(n).fill(-1);
      this.light = 2.6;
      this.ev = { ate: 0, poison: 0, key: 0, crate: 0, reversed: false, jumped: false };

      // Starting snake: 4 long, middle row, facing right
      const hx = Math.max(3, Math.floor(w / 4));
      const row = this.m.yinyang ? Math.floor(h / 2) + 1 : Math.floor(h / 2);
      this.snakes = [this.makeSnake(hx, row, 1)];
      if (this.m.yinyang) this.snakes.push(this.makeSnake(w - 1 - hx, h - 1 - row, 3));

      // First apple sits straight ahead of the snake (like Google's)
      const first = row * w + (w - 1 - hx);
      this.fill(first);
    }

    makeSnake(hx, y, dir) {
      const cells = [], dims = [], sers = [];
      for (let i = 0; i < 4; i++) {
        const x = dir === 1 ? hx - i : hx + i;
        cells.push(y * this.w + x); dims.push(0); sers.push(this.serial++);
      }
      return { cells, dims, sers, dir, grow: 0, dim: 0, poison: 0, scramble: [0, 1, 2, 3],
        mineT: 0, prevHead: cells[0], removed: -1, alive: true };
    }

    clone() {
      const o = Object.create(Game.prototype);
      o.cfg = this.cfg; o.w = this.w; o.h = this.h; o.n = this.n; o.m = this.m; o.g = this.g;
      o.rng = { s: this.rng.s };
      o.score = this.score; o.progress = this.progress; o.steps = this.steps; o.sinceEat = this.sinceEat;
      o.over = this.over; o.won = this.won; o.reason = this.reason;
      o.serial = this.serial; o.idc = this.idc; o.pairc = this.pairc; o.eatenTotal = this.eatenTotal;
      o.poisonEaten = this.poisonEaten; o.relocations = this.relocations;
      o.apples = this.apples.map(a => Object.assign({}, a));
      o.poisons = this.poisons.slice();
      o.keys = this.keys.map(k => Object.assign({}, k));
      o.crates = this.crates.slice(); o.targets = this.targets.slice();
      o.mines = this.mines.slice();
      o.gates = this.gates.map(g => Object.assign({}, g));
      o.buns = this.buns.map(b => Object.assign({}, b));
      o.wall = this.wall.slice(); o.bun = this.bun.slice(); o.statue = this.statue.slice();
      o.shield = this.shield.slice(); o.arrow = this.arrow.slice();
      o.light = this.light;
      o.ev = Object.assign({}, this.ev);
      o.snakes = this.snakes.map(s => ({
        cells: s.cells.slice(), dims: s.dims.slice(), sers: s.sers.slice(), dir: s.dir, grow: s.grow,
        dim: s.dim, poison: s.poison, scramble: s.scramble.slice(), mineT: s.mineT,
        prevHead: s.prevHead, removed: s.removed, alive: s.alive,
      }));
      return o;
    }

    // ---------- board helpers ----------
    xy(c) { return [c % this.w, (c / this.w) | 0]; }

    // Cell next to c in direction d (-1 if off the board and edges are solid)
    neighbor(c, d) {
      let x = c % this.w + DX[d], y = ((c / this.w) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
        if (!this.m.wrap) return -1;
        x = (x + this.w) % this.w; y = (y + this.h) % this.h;
      }
      return y * this.w + x;
    }

    appleAt(c) { for (const a of this.apples) if (a.c === c) return a; return null; }

    canEat(sn, a) { return !a.locked && (!this.m.dimension || a.dim === sn.dim); }

    // Everything sitting on a cell (used for spawning)
    occupiedGrid() {
      const o = new Uint8Array(this.n);
      for (const s of this.snakes) for (const c of s.cells) o[c] = 1;
      for (const a of this.apples) o[a.c] = 1;
      for (const c of this.poisons) o[c] = 1;
      for (const k of this.keys) o[k.c] = 1;
      for (const c of this.crates) o[c] = 1;
      for (const c of this.targets) o[c] = 1;
      for (const c of this.mines) o[c] = 1;
      for (let i = 0; i < this.n; i++) if (this.wall[i] || this.bun[i] || this.statue[i] || this.shield[i]) o[i] = 1;
      return o;
    }

    freeCells(occ, danger, extraOk) {
      const out = [], near = [];
      for (let c = 0; c < this.n; c++) {
        if (occ[c]) continue;
        if (extraOk && !extraOk(c)) continue;
        if (danger && this.nearHead(c)) near.push(c); else out.push(c);
      }
      // Dangerous things prefer to stay away from heads, but use any space if needed
      return out.length ? out : near;
    }

    nearHead(c) {
      const [x, y] = this.xy(c);
      for (const s of this.snakes) {
        const [hx, hy] = this.xy(s.cells[0]);
        if (Math.abs(hx - x) + Math.abs(hy - y) <= SPAWN_RADIUS) return true;
      }
      return false;
    }

    pick(list) { return list.length ? list[randInt(this.rng, list.length)] : -1; }

    // How many "apple units" are on the board right now
    units() {
      const pairs = new Set();
      let n = 0;
      for (const a of this.apples) {
        if (a.pair) { if (!pairs.has(a.pair)) { pairs.add(a.pair); n++; } } else n++;
      }
      return n + this.crates.length;
    }

    // Top the board up with apples; returns false if there was no room
    fill(firstCell) {
      let want;
      if (this.cfg.apples === 'dice') {
        if (this.units() > 0) return true;
        want = 1 + randInt(this.rng, 6);
      } else want = this.cfg.apples - this.units();
      let ok = true;
      for (let i = 0; i < want; i++) {
        const c = (i === 0 && firstCell != null) ? firstCell : null;
        if (!this.spawnUnit(c)) { ok = false; break; }
      }
      if (this.m.poison) {
        const k = this.cfg.apples === 'dice' ? 1 : this.cfg.apples;
        while (this.poisons.length < k) {
          const c = this.pick(this.freeCells(this.occupiedGrid(), true));
          if (c < 0) break;
          this.poisons.push(c); this.arrow[c] = -1;
        }
      }
      return ok;
    }

    spawnUnit(preferCell) {
      const occ = this.occupiedGrid();
      const m = this.m;
      const usable = c => !occ[c];
      if (m.sokoban) {
        // Crates keep away from the edges when possible so they can be pushed
        const inner = c => { const [x, y] = this.xy(c); return x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1; };
        let crate = this.pick(this.freeCells(occ, false, inner));
        if (crate < 0) crate = this.pick(this.freeCells(occ, false));
        if (crate < 0) return false;
        occ[crate] = 1;
        const target = this.pick(this.freeCells(occ, false, inner));
        const t = target >= 0 ? target : this.pick(this.freeCells(occ, false));
        if (t < 0) return false;
        this.crates.push(crate); this.targets.push(t);
        this.arrow[crate] = -1; this.arrow[t] = -1;
        return true;
      }
      if (m.portal) {
        const a = this.pick(this.freeCells(occ, false));
        if (a < 0) return false;
        occ[a] = 1;
        const b = this.pick(this.freeCells(occ, false));
        if (b < 0) return false;
        const pair = this.pairc++;
        this.addApple(a, pair); this.addApple(b, pair);
        return true;
      }
      const danger = !!m.key; // a locked apple is deadly to touch
      let c = (preferCell != null && preferCell >= 0 && usable(preferCell) && !(danger && this.nearHead(preferCell)))
        ? preferCell : this.pick(this.freeCells(occ, danger));
      if (c < 0) return false;
      const a = this.addApple(c, 0);
      occ[c] = 1;
      if (m.key) {
        a.locked = true;
        const k = this.pick(this.freeCells(occ, false));
        if (k >= 0) { this.keys.push({ c: k, aid: a.id }); this.arrow[k] = -1; } else a.locked = false;
      }
      if (m.shield) this.addShields(a, occ);
      return true;
    }

    addApple(c, pair) {
      const a = { id: this.idc++, c, pair, dim: 0, locked: false, vx: 0, vy: 0, shields: [] };
      if (this.m.dimension) a.dim = this.snakes[0].dim;
      if (this.m.winged) { a.vx = rand(this.rng) < 0.5 ? -1 : 1; a.vy = rand(this.rng) < 0.5 ? -1 : 1; }
      this.apples.push(a);
      this.arrow[c] = -1; // an apple wipes out an arrow
      return a;
    }

    addShields(a, occ) {
      // Edges and body parts already count as shields
      const sides = [];
      let blocked = 0;
      for (let d = 0; d < 4; d++) {
        const nc = this.neighbor(a.c, d);
        if (nc < 0 || occ[nc]) blocked++; else sides.push(nc);
      }
      let want = 1 + randInt(this.rng, 3) - blocked;
      want = Math.min(want, sides.length - 1); // always leave a way in
      while (want-- > 0) {
        const i = randInt(this.rng, sides.length);
        const c = sides.splice(i, 1)[0];
        if (this.nearHead(c)) continue;
        this.shield[c]++; a.shields.push(c); occ[c] = 1;
      }
    }

    removeApple(a) {
      this.apples.splice(this.apples.indexOf(a), 1);
      for (const c of a.shields) if (this.shield[c] > 0) this.shield[c]--;
    }

    spawnDanger(kind) {
      const c = this.pick(this.freeCells(this.occupiedGrid(), true));
      if (c < 0) return;
      if (kind === 'wall') this.wall[c] = 1;
      else if (kind === 'mine') this.mines.push(c);
      this.arrow[c] = -1;
    }

    spawnGate() {
      // A gate is a dotted line 2 cells long that sits between two rows or two columns
      const used = new Set();
      for (const g of this.gates) [g.a1, g.b1, g.a2, g.b2].forEach(c => used.add(c));
      const opts = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (x + 1 < this.w && y + 1 < this.h) {
          const a1 = y * this.w + x, b1 = a1 + 1, a2 = a1 + this.w, b2 = a2 + 1;
          opts.push({ a1, b1, a2, b2 });            // vertical line between columns
          opts.push({ a1, b1: a2, a2: b1, b2 });    // horizontal line between rows
        }
      }
      const good = opts.filter(g => ![g.a1, g.b1, g.a2, g.b2].some(c => used.has(c) || this.nearHead(c)));
      const list = good.length ? good : opts.filter(g => ![g.a1, g.b1, g.a2, g.b2].some(c => used.has(c)));
      if (list.length) this.gates.push(list[randInt(this.rng, list.length)]);
    }

    gateShift(from, to) {
      for (const g of this.gates) {
        if (from === g.a1 && to === g.b1) return g.b2;
        if (from === g.b1 && to === g.a1) return g.a2;
        if (from === g.a2 && to === g.b2) return g.b1;
        if (from === g.b2 && to === g.a2) return g.a1;
      }
      return to;
    }

    // Input the player would have to press to actually move in direction d
    inputFor(d, si) {
      const sn = this.snakes[si || 0];
      if (sn.poison > 0) return sn.scramble.indexOf(d);
      return d;
    }

    // Is a cell blocked by something solid (not counting snake bodies)?
    solidAt(c) {
      if (this.wall[c] || this.bun[c] || this.statue[c] || this.shield[c]) return true;
      for (const a of this.apples) if (a.locked && a.c === c) return true;
      for (const mc of this.mines) if (mc === c) return true;
      return false;
    }

    die(reason) { this.over = true; this.won = false; this.reason = reason; }

    // ---------- one move of the game ----------
    step(input) {
      if (this.over) return;
      const m = this.m, ev = this.ev = { ate: 0, poison: 0, key: 0, crate: 0, reversed: false, jumped: false };
      this.steps++; this.sinceEat++;

      // 1. Work out where each snake wants to go
      const moves = [];
      for (let i = 0; i < this.snakes.length; i++) {
        const sn = this.snakes[i];
        let d = input == null ? -1 : input;
        if (d >= 0 && i === 1) d = (d + 2) % 4; // yin yang: the second snake mirrors you
        if (d >= 0 && sn.poison > 0) d = sn.scramble[d];
        if (d < 0 || d === (sn.dir + 2) % 4) d = sn.dir;
        const head = sn.cells[0];
        if (m.arrow) {
          if (this.arrow[head] >= 0) d = this.arrow[head];          // forced turn
          else if (d !== sn.dir) this.arrow[head] = d;              // remember this turn
        }
        const turned = d !== sn.dir;
        sn.dir = d;
        let nc = this.neighbor(head, d);
        if (nc < 0) { this.die('Hit the edge'); return; }
        if (m.gate) { const s = this.gateShift(head, nc); if (s !== nc) { nc = s; ev.jumped = true; } }
        if (m.arrow && this.arrow[nc] >= 0 && this.arrow[nc] === (d + 2) % 4) { this.die('Went against an arrow'); return; }
        moves.push({ sn, nc, turned });
      }

      // 2. Sokoban: push crates
      if (m.sokoban) for (const mv of moves) this.pushCrate(mv);

      // 3. Move the snakes (eat first so the tail knows whether to stay)
      const eaten = [];
      for (const mv of moves) {
        const sn = mv.sn;
        sn.prevHead = sn.cells[0];
        const a = this.appleAt(mv.nc);
        let ate = null;
        if (a && this.canEat(sn, a)) { ate = a; sn.grow += this.g; }
        const pi = this.poisons.indexOf(mv.nc);
        sn.cells.unshift(mv.nc); sn.dims.unshift(sn.dim); sn.sers.unshift(this.serial++);
        sn.removed = -1;
        if (sn.grow > 0) sn.grow--;
        else {
          sn.removed = sn.cells.pop(); sn.dims.pop();
          const ser = sn.sers.pop();
          if (m.hotdog) this.dropBuns(ser);
        }
        if (ate) eaten.push({ sn, a: ate });
        if (pi >= 0) {
          this.poisons.splice(pi, 1);
          sn.poison = Math.max(8, Math.ceil(sn.cells.length / 2));
          const r = 1 + randInt(this.rng, 3);
          sn.scramble = [0, 1, 2, 3].map(x => (x + r) % 4);
          this.poisonEaten++; ev.poison++;
        }
        mv.ate = ate;
      }

      // 4. Portal: come out of the matching apple
      if (m.portal) for (const e of eaten) {
        const twin = this.apples.find(b => b.pair === e.a.pair && b !== e.a);
        if (twin) { e.sn.cells[0] = twin.c; ev.jumped = true; this.removeApple(twin); }
      }

      // 5. Crashes
      for (const mv of moves) {
        const sn = mv.sn, h = sn.cells[0];
        if (this.wall[h]) return this.die('Hit a wall');
        if (this.bun[h]) return this.die('Hit a bun');
        if (this.statue[h]) return this.die('Hit the statue');
        if (this.shield[h]) return this.die('Hit a shield');
        for (const a of this.apples) if (a.locked && a.c === h) return this.die('Hit a lock');
        if (this.mines.indexOf(h) >= 0) return this.die('Stepped on a mine');
        for (const other of this.snakes) {
          const self = other === sn;
          if (self && m.peaceful) continue;
          for (let i = self ? 1 : 0; i < other.cells.length; i++) {
            if (other.cells[i] !== h) continue;
            if (m.cheese && i % 2 === 1) continue;                 // a hole
            if (m.dimension && other.dims[i] !== sn.dim) continue; // other dimension
            if (other === sn) return this.die('Hit yourself');
            return this.die(this.m.yinyang ? 'The two snakes crashed' : 'Hit the other snake');
          }
        }
      }

      // 6. What eating does in each mode
      for (const e of eaten) {
        const sn = e.sn;
        if (this.apples.indexOf(e.a) >= 0) this.removeApple(e.a);
        this.score++; this.progress++; this.eatenTotal++; ev.ate++; this.sinceEat = 0;
        if (m.twin) {
          sn.cells.reverse(); sn.dims.reverse(); sn.sers.reverse();
          sn.dir = this.dirBetween(sn.cells[1], sn.cells[0], (sn.dir + 2) % 4);
          ev.reversed = true;
        }
        if (m.dimension) sn.dim ^= 1;
        if (m.statue) {
          this.statue.fill(0);
          for (let i = 1; i < sn.cells.length; i++) this.statue[sn.cells[i]] = 1;
        }
        if (m.wall) this.spawnDanger('wall');
        if (m.minesweeper) this.spawnDanger('mine');
        if (m.gate && this.eatenTotal % 2 === 1) this.spawnGate();
        if (m.light) this.light = 7;
      }

      // 7. Keys
      if (m.key) for (const mv of moves) {
        const h = mv.sn.cells[0];
        const ki = this.keys.findIndex(k => k.c === h);
        if (ki >= 0) {
          const k = this.keys.splice(ki, 1)[0];
          const a = this.apples.find(x => x.id === k.aid);
          if (a) a.locked = false;
          this.progress++; ev.key++;
        }
      }

      // 8. Hotdog: a turn puts buns on both sides of the head
      if (m.hotdog) for (const mv of moves) if (mv.turned) {
        const sn = mv.sn, h = sn.cells[0];
        const occ = this.occupiedGrid();
        for (const side of [(sn.dir + 1) % 4, (sn.dir + 3) % 4]) {
          const c = this.neighbor(h, side);
          if (c < 0 || occ[c]) continue;
          this.bun[c] = 1; this.buns.push({ c, anchor: sn.sers[0] });
        }
      }

      // 9. New apples (and the win check)
      if (ev.ate || ev.crate) {
        const full = this.snakes.reduce((t, s) => t + s.cells.length + s.grow, 0) >= this.n;
        const ok = full ? false : this.fill();
        if (full || (!ok && this.units() === 0)) { this.over = true; this.won = true; this.reason = 'Board complete'; return; }
      }
      if (m.poison && ev.poison) this.fill();

      // 10. Moving apples
      if ((m.winged || m.magnet) && this.steps % 2 === 0) this.moveApples();

      // 11. Mines: stay next to one for 4 moves and it goes off
      if (m.minesweeper) for (const sn of this.snakes) {
        const [hx, hy] = this.xy(sn.cells[0]);
        const inside = this.mines.some(c => { const [x, y] = this.xy(c); return Math.abs(x - hx) <= 1 && Math.abs(y - hy) <= 1; });
        sn.mineT = inside ? sn.mineT + 1 : 0;
        if (sn.mineT >= 4) return this.die('A mine exploded');
      }

      for (const sn of this.snakes) if (sn.poison > 0) sn.poison--;
      if (m.light) this.light = Math.max(2.6, this.light - 0.12);
    }

    dirBetween(from, to, fallback) {
      for (let d = 0; d < 4; d++) if (this.neighbor(from, d) === to) return d;
      return fallback;
    }

    dropBuns(ser) {
      for (let i = this.buns.length - 1; i >= 0; i--) {
        if (this.buns[i].anchor === ser) { this.bun[this.buns[i].c] = 0; this.buns.splice(i, 1); }
      }
    }

    pushCrate(mv) {
      const ci = this.crates.indexOf(mv.nc);
      if (ci < 0) return;
      const d = mv.sn.dir;
      const dest = this.neighbor(mv.nc, d);
      const occ = this.occupiedGrid();
      const onSnake = c => this.snakes.some(s => s.cells.indexOf(c) >= 0);
      occ[mv.nc] = 1;
      const isTarget = dest >= 0 && this.targets.indexOf(dest) >= 0 && !onSnake(dest);
      if (dest >= 0 && (!occ[dest] || isTarget)) {
        if (isTarget) {
          // Crate lands on a target: it opens into an apple
          this.crates.splice(ci, 1);
          this.targets.splice(this.targets.indexOf(dest), 1);
          this.addApple(dest, 0);
          this.progress++; this.ev.crate++;
        } else this.crates[ci] = dest;
      } else {
        // Pushed into something solid: the crate jumps to a random spot
        occ[mv.nc] = 0;
        const c = this.pick(this.freeCells(occ, false, c2 => c2 !== mv.nc));
        if (c >= 0) this.crates[ci] = c; else this.crates.splice(ci, 1);
        this.relocations++;
      }
    }

    moveApples() {
      const occ = this.occupiedGrid();
      for (const a of this.apples) {
        if (a.locked) continue;
        const [x, y] = this.xy(a.c);
        const free = (cx, cy) => cx >= 0 && cy >= 0 && cx < this.w && cy < this.h && !occ[cy * this.w + cx];
        if (this.m.winged) {
          if (!free(x + a.vx, y)) a.vx = -a.vx;
          if (!free(x, y + a.vy)) a.vy = -a.vy;
          if (!free(x + a.vx, y + a.vy)) { a.vx = -a.vx; a.vy = -a.vy; }
          if (free(x + a.vx, y + a.vy)) {
            occ[a.c] = 0; a.c = (y + a.vy) * this.w + x + a.vx; occ[a.c] = 1;
          }
        } else {
          let best = null, bd = 1e9;
          for (const s of this.snakes) {
            const [hx, hy] = this.xy(s.cells[0]);
            const dd = Math.abs(hx - x) + Math.abs(hy - y);
            if (dd < bd) { bd = dd; best = [hx - x, hy - y]; }
          }
          if (!best || bd <= 1) continue;
          const sx = Math.sign(best[0]), sy = Math.sign(best[1]);
          const tries = Math.abs(best[0]) >= Math.abs(best[1]) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
          for (const [mx, my] of tries) {
            if ((mx || my) && free(x + mx, y + my)) {
              occ[a.c] = 0; a.c = (y + my) * this.w + x + mx; occ[a.c] = 1; break;
            }
          }
        }
        this.arrow[a.c] = -1;
      }
    }
  }

  const api = { Game, SIZES, SPEEDS, APPLE_COUNTS, MODES, APPROXIMATE_MODES, DX, DY, rand };
  root.SnakeEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
