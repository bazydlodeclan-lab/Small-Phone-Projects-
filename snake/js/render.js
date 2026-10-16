/* Draws the board in the Google Snake style. */
(function (root) {
  'use strict';

  // Google Snake colors
  const C = {
    light: '#AAD751', dark: '#A2D149',
    snake: '#4E7CF6', snakeDark: '#3C66D8', snake2: '#2E2E33',
    apple: '#E7471D', appleShade: '#C93A12', stem: '#6B3A1E', leaf: '#5FA032',
    poison: '#8E8E9A', wall: '#6D6A62', wallEdge: '#58554E',
    bun: '#E2A955', statue: '#9A9A96', shield: '#5E7FB5', lock: '#8D5A2B',
    key: '#F2B705', crate: '#B07A3F', target: '#D9473B', mine: '#2B2B2B',
  };
  const PAIR_COLORS = ['#E7471D', '#8E44D9', '#1E88E5', '#F28C1B', '#E91E8C'];

  function draw(ctx, game, alpha, opts) {
    opts = opts || {};
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const cs = Math.min(W / game.w, H / game.h);
    const t = Math.max(0, Math.min(1, alpha));
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // Checkerboard
    for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? C.light : C.dark;
      ctx.fillRect(x * cs, y * cs, cs + 0.5, cs + 0.5);
    }
    const cx = c => (c % game.w + 0.5) * cs;
    const cy = c => (((c / game.w) | 0) + 0.5) * cs;

    // Arrow tiles
    if (game.m.arrow) {
      ctx.fillStyle = 'rgba(40,70,20,0.35)';
      for (let c = 0; c < game.n; c++) if (game.arrow[c] >= 0) drawArrow(ctx, cx(c), cy(c), cs * 0.32, game.arrow[c]);
    }
    // Sokoban targets
    for (const c of game.targets) {
      for (const [r, col] of [[0.38, C.target], [0.26, '#fff'], [0.14, C.target]]) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx(c), cy(c), cs * r, 0, 7); ctx.fill();
      }
    }
    // Mine danger zones
    if (game.m.minesweeper) for (const c of game.mines) {
      ctx.fillStyle = 'rgba(220,60,40,0.16)';
      ctx.fillRect(cx(c) - cs * 1.5, cy(c) - cs * 1.5, cs * 3, cs * 3);
    }
    // Statue
    for (let c = 0; c < game.n; c++) if (game.statue[c]) {
      ctx.fillStyle = C.statue; roundRect(ctx, cx(c) - cs * 0.42, cy(c) - cs * 0.42, cs * 0.84, cs * 0.84, cs * 0.25); ctx.fill();
      ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.lineWidth = Math.max(1, cs * 0.04);
      ctx.beginPath(); ctx.moveTo(cx(c) - cs * 0.2, cy(c) - cs * 0.25); ctx.lineTo(cx(c), cy(c)); ctx.lineTo(cx(c) + cs * 0.12, cy(c) + cs * 0.25); ctx.stroke();
    }
    // Walls
    for (let c = 0; c < game.n; c++) if (game.wall[c]) {
      const x = cx(c) - cs / 2, y = cy(c) - cs / 2;
      ctx.fillStyle = C.wall; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.strokeStyle = C.wallEdge; ctx.lineWidth = Math.max(1, cs * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + 1, y + cs / 2); ctx.lineTo(x + cs - 1, y + cs / 2);
      ctx.moveTo(x + cs / 2, y + 1); ctx.lineTo(x + cs / 2, y + cs / 2);
      ctx.moveTo(x + cs / 4, y + cs / 2); ctx.lineTo(x + cs / 4, y + cs - 1);
      ctx.moveTo(x + cs * 0.75, y + cs / 2); ctx.lineTo(x + cs * 0.75, y + cs - 1);
      ctx.stroke();
    }
    // Hotdog buns
    for (let c = 0; c < game.n; c++) if (game.bun[c]) {
      ctx.fillStyle = C.bun; roundRect(ctx, cx(c) - cs * 0.4, cy(c) - cs * 0.4, cs * 0.8, cs * 0.8, cs * 0.35); ctx.fill();
    }
    // Shields
    for (let c = 0; c < game.n; c++) if (game.shield[c]) drawShield(ctx, cx(c), cy(c), cs);
    // Gates
    for (const g of game.gates) {
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2, cs * 0.1); ctx.setLineDash([cs * 0.15, cs * 0.12]);
      const mx1 = (cx(g.a1) + cx(g.b1)) / 2, my1 = (cy(g.a1) + cy(g.b1)) / 2;
      const mx2 = (cx(g.a2) + cx(g.b2)) / 2, my2 = (cy(g.a2) + cy(g.b2)) / 2;
      const dx = (mx2 - mx1), dy = (my2 - my1);
      ctx.beginPath(); ctx.moveTo(mx1 - dx / 2, my1 - dy / 2); ctx.lineTo(mx2 + dx / 2, my2 + dy / 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Crates
    for (const c of game.crates) {
      const x = cx(c) - cs * 0.42, y = cy(c) - cs * 0.42, s = cs * 0.84;
      ctx.fillStyle = C.crate; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#7A5226'; ctx.lineWidth = Math.max(1, cs * 0.07);
      ctx.strokeRect(x, y, s, s);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.stroke();
    }
    // Keys
    for (const k of game.keys) drawKey(ctx, cx(k.c), cy(k.c), cs);
    // Mines
    for (const c of game.mines) {
      ctx.fillStyle = C.mine; ctx.beginPath(); ctx.arc(cx(c), cy(c), cs * 0.28, 0, 7); ctx.fill();
      ctx.strokeStyle = C.mine; ctx.lineWidth = Math.max(1, cs * 0.08);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(cx(c), cy(c)); ctx.lineTo(cx(c) + Math.cos(a) * cs * 0.4, cy(c) + Math.sin(a) * cs * 0.4); ctx.stroke();
      }
    }
    // Poison apples
    for (const c of game.poisons) drawApple(ctx, cx(c), cy(c), cs, C.poison, 1, false);
    // Apples
    for (const a of game.apples) {
      const sn0 = game.snakes[0];
      const ghost = game.m.dimension && a.dim !== sn0.dim;
      const col = a.pair ? PAIR_COLORS[(a.pair - 1) % PAIR_COLORS.length] : C.apple;
      if (a.locked) { drawLock(ctx, cx(a.c), cy(a.c), cs); continue; }
      drawApple(ctx, cx(a.c), cy(a.c), cs, col, ghost ? 0.35 : 1, game.m.winged);
    }

    // Snakes
    game.snakes.forEach((sn, i) => drawSnake(ctx, game, sn, i, t, cs, cx, cy));

    // Light mode darkness
    if (game.m.light && !opts.noDark) drawDark(ctx, game, cs, cx, cy, W, H);
    ctx.restore();
  }

  function adjacent(game, a, b) {
    const ax = a % game.w, ay = (a / game.w) | 0, bx = b % game.w, by = (b / game.w) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }

  function drawSnake(ctx, game, sn, idx, t, cs, cx, cy) {
    const cells = sn.cells, L = cells.length;
    const jumped = game.ev.jumped || game.ev.reversed;
    // Where each body part is mid-move
    const pos = [];
    for (let i = 0; i < L; i++) {
      let prev;
      if (i === 0) prev = (!jumped && L > 1 && adjacent(game, cells[1], cells[0])) ? cells[1] : cells[0];
      else if (i + 1 < L) prev = cells[i + 1];
      else prev = sn.removed >= 0 ? sn.removed : cells[i];
      if (i > 0 && (jumped || !adjacent(game, prev, cells[i]))) prev = cells[i];
      const k = (game.over || prev === cells[i]) ? 1 : t;
      pos.push([cx(prev) + (cx(cells[i]) - cx(prev)) * k, cy(prev) + (cy(cells[i]) - cy(prev)) * k]);
    }
    const base = idx === 0 ? C.snake : C.snake2;
    const width = cs * 0.78;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Body: one tube through the turn points; pieces split wherever the body jumps
    const style = i => {
      if (game.m.cheese && i % 2 === 1) return null;
      if (game.m.dimension && sn.dims[i] !== sn.dim) return 'ghost';
      return 'solid';
    };
    const seg = (i, j) => {
      // path from part i to part j (j = i + 1) through the cell corner between them
      const a = pos[i], b = pos[j];
      ctx.lineTo(...a);
      if (adjacent(game, cells[i], cells[j])) ctx.lineTo(cx(cells[j]), cy(cells[j]));
      ctx.lineTo(...b);
    };
    if (game.m.cheese) {
      for (let i = 0; i < L; i++) {
        if (style(i) === null) continue;
        ctx.strokeStyle = base; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(...pos[i]); ctx.lineTo(pos[i][0] + 0.01, pos[i][1]); ctx.stroke();
      }
    } else {
      let i = 0;
      while (i < L) {
        const st = style(i);
        let j = i;
        while (j + 1 < L && style(j + 1) === st && adjacent(game, cells[j], cells[j + 1])) j++;
        ctx.globalAlpha = st === 'ghost' ? 0.3 : 1;
        ctx.strokeStyle = base; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(...pos[i]);
        if (j === i) ctx.lineTo(pos[i][0] + 0.01, pos[i][1]);
        for (let k = i; k < j; k++) seg(k, k + 1);
        ctx.stroke();
        i = j + 1;
      }
      ctx.globalAlpha = 1;
    }

    // Head with eyes
    const [hx, hy] = pos[0];
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.arc(hx, hy, width * 0.52, 0, 7); ctx.fill();
    const dx = [0, 1, 0, -1][sn.dir], dy = [-1, 0, 1, 0][sn.dir];
    const px = -dy, py = dx;
    for (const side of [-1, 1]) {
      const ex = hx + dx * cs * 0.12 + px * side * cs * 0.2, ey = hy + dy * cs * 0.12 + py * side * cs * 0.2;
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(ex, ey, cs * 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = '#1B1B1B'; ctx.beginPath(); ctx.arc(ex + dx * cs * 0.05, ey + dy * cs * 0.05, cs * 0.075, 0, 7); ctx.fill();
    }
    if (sn.poison > 0) {
      ctx.fillStyle = 'rgba(140,60,200,0.35)'; ctx.beginPath(); ctx.arc(hx, hy, width * 0.6, 0, 7); ctx.fill();
    }
  }

  function drawApple(ctx, x, y, cs, col, alpha, wings) {
    ctx.globalAlpha = alpha;
    if (wings) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * cs * 0.36, y - cs * 0.08, cs * 0.2, cs * 0.11, s * -0.5, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y + cs * 0.04, cs * 0.36, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(x - cs * 0.13, y - cs * 0.06, cs * 0.09, 0, 7); ctx.fill();
    ctx.strokeStyle = C.stem; ctx.lineWidth = Math.max(1, cs * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - cs * 0.26); ctx.lineTo(x + cs * 0.04, y - cs * 0.42); ctx.stroke();
    ctx.fillStyle = C.leaf;
    ctx.beginPath(); ctx.ellipse(x + cs * 0.15, y - cs * 0.36, cs * 0.13, cs * 0.07, -0.5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLock(ctx, x, y, cs) {
    ctx.fillStyle = C.lock; roundRect(ctx, x - cs * 0.4, y - cs * 0.4, cs * 0.8, cs * 0.8, cs * 0.12); ctx.fill();
    ctx.fillStyle = C.key; ctx.beginPath(); ctx.arc(x, y - cs * 0.06, cs * 0.11, 0, 7); ctx.fill();
    ctx.fillRect(x - cs * 0.05, y - cs * 0.04, cs * 0.1, cs * 0.24);
  }

  function drawKey(ctx, x, y, cs) {
    ctx.strokeStyle = C.key; ctx.lineWidth = Math.max(2, cs * 0.1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - cs * 0.16, y, cs * 0.14, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - cs * 0.02, y); ctx.lineTo(x + cs * 0.34, y);
    ctx.moveTo(x + cs * 0.2, y); ctx.lineTo(x + cs * 0.2, y + cs * 0.14);
    ctx.moveTo(x + cs * 0.32, y); ctx.lineTo(x + cs * 0.32, y + cs * 0.14); ctx.stroke();
  }

  function drawShield(ctx, x, y, cs) {
    ctx.fillStyle = C.shield;
    ctx.beginPath();
    ctx.moveTo(x, y - cs * 0.4); ctx.lineTo(x + cs * 0.34, y - cs * 0.26); ctx.lineTo(x + cs * 0.3, y + cs * 0.1);
    ctx.quadraticCurveTo(x + cs * 0.2, y + cs * 0.32, x, y + cs * 0.42);
    ctx.quadraticCurveTo(x - cs * 0.2, y + cs * 0.32, x - cs * 0.3, y + cs * 0.1);
    ctx.lineTo(x - cs * 0.34, y - cs * 0.26); ctx.closePath(); ctx.fill();
  }

  function drawArrow(ctx, x, y, r, d) {
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.6, -r * 0.8); ctx.lineTo(-r * 0.6, r * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  let darkCanvas = null;
  function drawDark(ctx, game, cs, cx, cy, W, H) {
    if (!darkCanvas) darkCanvas = document.createElement('canvas');
    darkCanvas.width = W; darkCanvas.height = H;
    const d = darkCanvas.getContext('2d');
    d.fillStyle = 'rgba(8,14,4,0.92)'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const g = d.createRadialGradient(x, y, r * 0.35, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.beginPath(); d.arc(x, y, r, 0, 7); d.fill();
    };
    for (const sn of game.snakes) hole(cx(sn.cells[0]), cy(sn.cells[0]), game.light * cs);
    for (const a of game.apples) hole(cx(a.c), cy(a.c), cs * 0.7);
    d.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCanvas, 0, 0);
  }

  // Small apple icon for the score bar
  function appleIcon(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawApple(ctx, canvas.width / 2, canvas.height / 2 + canvas.height * 0.05, canvas.width * 0.95, C.apple, 1, false);
  }

  root.SnakeRender = { draw, appleIcon, COLORS: C };
})(typeof window !== 'undefined' ? window : globalThis);
