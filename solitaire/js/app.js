/* Connects the card table, the AIs and the page together. */
(function () {
  'use strict';
  const E = window.SolEngine, AI = window.SolAI, RL = window.SolRL;
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const saved = store.get('sollab.settings', {});
  const MODE_NAME = { 1: 'Easy (draw 1)', 3: 'Hard (draw 3)' };

  const S = {
    tab: 'play', draw: saved.draw === 3 ? 3 : 1, dealType: saved.dealType === 'winnable' ? 'winnable' : 'random',
    game: new E.Game({ draw: 1 }), driver: 'player', running: false,
    started: 0, elapsed: 0, finished: false, finishing: false, finding: null,
    aiKind: 'solver', aiDelay: 250, ai: null, aiJob: null, aiStatus: null, aiPlayed: 0, aiWon: 0, aiStuck: 0, aiLast: '', acc: 0,
    trainer: null, trainCfg: RL.clone(RL.DEFAULTS), trainView: 'live', trainRunning: false,
    replay: null, listView: 'latest', modeFilter: 'all', uiDirty: true, lastUi: 0, last: performance.now(),
  };

  // ---------- Table: cards and empty spots ----------
  const table = $('table');
  const cardEls = [], slots = {};
  for (let c = 0; c < 52; c++) {
    const el = document.createElement('div');
    const r = E.RANKS[E.rank(c)], s = E.SUITS[E.suit(c)];
    el.className = 'card ' + (E.red(c) ? 'red' : 'black');
    el.dataset.card = c;
    const face = E.rank(c) >= 10 ? `<div class="pip face">${r}${s}</div>` : `<div class="pip">${s}</div>`;
    el.innerHTML = `<div class="corner"><span>${r}</span><span>${s}</span></div>${face}<div class="corner br"><span>${r}</span><span>${s}</span></div>`;
    table.appendChild(el);
    cardEls.push(el);
  }
  function makeSlot(cls, text) { const el = document.createElement('div'); el.className = 'slot ' + cls; el.textContent = text || ''; table.insertBefore(el, table.firstChild); return el; }
  slots.stock = makeSlot('stock', '↻');
  slots.waste = makeSlot('waste');
  slots.found = [0, 1, 2, 3].map(f => makeSlot('found', E.SUITS[f]));
  slots.tab = [0, 1, 2, 3, 4, 5, 6].map(() => makeSlot('col'));

  let G = null; // current geometry
  function geometry() {
    const W = table.clientWidth;
    const gap = Math.max(4, W * 0.014);
    const cw = (W - gap * 8) / 7, ch = cw * 1.4;
    const yTop = gap * 1.5, yTab = yTop + ch + gap * 2.2;
    const H = Math.round(yTab + ch * 3.5);
    table.style.height = H + 'px';
    table.style.setProperty('--cw', cw + 'px');
    table.style.setProperty('--ch', ch + 'px');
    G = { W, H, gap, cw, ch, yTop, yTab, x: i => gap + i * (cw + gap), downOff: ch * 0.1, upOff: ch * 0.27 };
    const place = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
    place(slots.stock, G.x(0), yTop); place(slots.waste, G.x(1), yTop);
    slots.waste.style.visibility = 'hidden';
    slots.found.forEach((el, f) => place(el, G.x(3 + f), yTop));
    slots.tab.forEach((el, i) => place(el, G.x(i), yTab));
    for (const el of [slots.stock, slots.waste, ...slots.found, ...slots.tab]) el.style.left = '0';
  }

  const where = new Array(52);
  function render(instant) {
    if (!G) geometry();
    const g = S.game;
    table.classList.toggle('instant', !!instant);
    const put = (c, x, y, z, up) => {
      const el = cardEls[c];
      if (el.classList.contains('drag')) return;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.zIndex = z;
      el.classList.toggle('back', !up);
    };
    g.stock.forEach((c, i) => { put(c, G.x(0), G.yTop, 10 + i, false); where[c] = { area: 'stock' }; });
    const wl = g.waste.length, fan = g.draw === 3 ? 3 : 1;
    g.waste.forEach((c, i) => {
      const k = Math.max(0, i - (wl - fan));
      put(c, G.x(1) + k * G.cw * 0.24, G.yTop, 100 + i, true);
      where[c] = { area: 'waste', idx: i };
    });
    g.found.forEach((p, f) => p.forEach((c, i) => { put(c, G.x(3 + f), G.yTop, 100 + i, true); where[c] = { area: 'found', f, idx: i }; }));
    const room = G.H - G.yTab - G.ch - G.gap;
    g.tab.forEach((col, i) => {
      const down = g.down[i];
      let need = 0;
      for (let k = 0; k < col.length - 1; k++) need += k < down ? G.downOff : G.upOff;
      const squeeze = need > room ? room / need : 1;
      let y = G.yTab;
      col.forEach((c, k) => {
        put(c, G.x(i), y, 200 + k, k >= down);
        where[c] = { area: 'tab', col: i, idx: k };
        y += (k < down ? G.downOff : G.upOff) * squeeze;
      });
    });
    slots.stock.textContent = g.stock.length ? '' : (g.waste.length ? '↻' : '');
    updateBar();
  }

  function updateBar() {
    const g = S.game;
    $('score').textContent = displayScore();
    $('moves').textContent = g.moves;
    $('time').textContent = S.driver === 'player' ? fmt(curSeconds()) : '–';
    $('undo').disabled = S.driver !== 'player' || !g.history.length || S.finished;
  }
  const curSeconds = () => S.driver === 'player' ? Math.floor((S.started ? (S.finished ? S.elapsed : performance.now() - S.started) : 0) / 1000) : 0;
  function displayScore() {
    const g = S.game, sec = curSeconds();
    let s = Math.max(0, g.score - 2 * Math.floor(sec / 10));
    if (g.won() && sec >= 30) s += Math.round(700000 / sec);
    return s;
  }
  const fmt = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  function overlay(html) {
    const o = $('overlay');
    if (!html) { o.hidden = true; o.innerHTML = ''; return; }
    o.innerHTML = '<div class="box">' + html + '</div>';
    o.hidden = false;
    o.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => actions[b.dataset.act]()));
  }
  function banner(t) { const b = $('banner'); b.hidden = !t; b.textContent = t || ''; }

  // ---------- Dealing ----------
  let findToken = 0;
  // Keep trying random deals until the solver proves one can be won
  function findWinnable(draw, done) {
    const token = ++findToken;
    let tries = 0;
    const next = () => {
      if (token !== findToken) return;
      tries++;
      const seed = (Math.random() * 2 ** 31) | 0;
      const solver = new AI.Solver(new E.Game({ draw, seed }), 120000);
      const step = () => {
        if (token !== findToken) return;
        const r = solver.run(3000);
        if (!r) return setTimeout(step, 0);
        if (r.status === 'win') done(seed, tries, r);
        else next();
      };
      step();
    };
    next();
  }

  function newPlayerGame() {
    S.driver = 'player'; S.running = false; S.finished = false; S.finishing = false; S.started = 0; S.elapsed = 0;
    overlay(''); banner('');
    if (S.dealType === 'winnable') {
      S.game = new E.Game({ draw: S.draw });
      S.game.stock.push(...S.game.tab.flat()); S.game.tab = S.game.tab.map(() => []); S.game.down = S.game.down.map(() => 0);
      render(true);
      overlay('<h2>Shuffling</h2><p>Finding a deal the solver can prove is winnable…</p>');
      findWinnable(S.draw, (seed, tries) => {
        if (S.tab !== 'play') return;
        S.game = new E.Game({ draw: S.draw, seed });
        overlay('');
        $('dealInfo').textContent = `This deal is proven winnable (checked ${tries} deal${tries > 1 ? 's' : ''} to find it). Deal #${seed}.`;
        render();
      });
    } else {
      findToken++;
      S.game = new E.Game({ draw: S.draw });
      $('dealInfo').textContent = `Random deal #${S.game.seed}. Some random deals can't be won by anyone.`;
      render();
    }
  }

  // ---------- Player moves ----------
  function playerMove(m) {
    const g = S.game;
    if (!g.isLegal(m)) return false;
    if (!S.started) S.started = performance.now();
    g.apply(m, true);
    render();
    afterPlayerMove();
    return true;
  }

  function afterPlayerMove() {
    const g = S.game;
    if (g.won()) return playerWon();
    if (g.canAutoFinish() && !S.finishing) {
      S.finishing = true;
      const tick = () => {
        if (S.driver !== 'player' || !S.finishing) return;
        const m = g.legalMoves().find(x => x.t === 't2f' || x.t === 'w2f');
        if (!m) { S.finishing = false; return; }
        g.apply(m, true); render();
        if (g.won()) { S.finishing = false; return playerWon(); }
        setTimeout(tick, 90);
      };
      setTimeout(tick, 150);
    }
  }

  function playerWon() {
    S.finished = true; S.elapsed = performance.now() - S.started;
    const key = 'sollab.best.' + S.draw;
    const score = displayScore();
    const best = store.get(key, 0);
    if (score > best) store.set(key, score);
    updateBar();
    overlay(`<h2>You win!</h2><p>Score ${score}${score > best ? ' · new best' : ''} · ${fmt(curSeconds())} · ${S.game.moves} moves</p><button class="btn" data-act="newGame">Play again</button>`);
  }

  function autoMove(loc, c) {
    const g = S.game;
    const ms = g.legalMoves().filter(m => {
      if (loc.area === 'tab') return (m.t === 't2f' && m.from === loc.col && loc.idx === g.tab[loc.col].length - 1) || (m.t === 't2t' && m.from === loc.col && m.idx === loc.idx);
      if (loc.area === 'waste') return m.t === 'w2f' || m.t === 'w2t';
      if (loc.area === 'found') return m.t === 'f2t' && m.from === loc.f;
      return false;
    });
    const score = m => (m.t.endsWith('2f') ? 3 : (g.tab[m.to] && g.tab[m.to].length ? 2 : 1));
    ms.sort((a, b) => score(b) - score(a));
    if (ms.length) playerMove(ms[0]);
    else { const el = cardEls[c]; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  // Dragging and tapping
  let drag = null;
  table.addEventListener('pointerdown', e => {
    if (S.driver !== 'player' || S.finished || S.finishing || !$('overlay').hidden) return;
    if (e.target.closest('.slot.stock')) { drawCard(); return; }
    const el = e.target.closest('.card');
    if (!el) return;
    const c = Number(el.dataset.card), loc = where[c], g = S.game;
    if (loc.area === 'stock') { drawCard(); return; }
    if (el.classList.contains('back')) return;
    if (loc.area === 'waste' && loc.idx !== g.waste.length - 1) return;
    if (loc.area === 'found' && loc.idx !== g.found[loc.f].length - 1) return;
    const cards = loc.area === 'tab' ? g.tab[loc.col].slice(loc.idx) : [c];
    const rect = table.getBoundingClientRect();
    drag = { c, loc, cards, x0: e.clientX, y0: e.clientY, rect, moved: false, origin: cards.map(k => parseTransform(cardEls[k].style.transform)) };
    table.setPointerCapture(e.pointerId);
  });
  table.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.cards.forEach((k, i) => {
      const el = cardEls[k];
      el.classList.add('drag');
      el.style.zIndex = 1000 + i;
      el.style.transform = `translate(${drag.origin[i][0] + dx}px, ${drag.origin[i][1] + dy}px)`;
    });
  });
  table.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    d.cards.forEach(k => cardEls[k].classList.remove('drag'));
    if (!d.moved) { autoMove(d.loc, d.c); return; }
    // which pile did the card land on?
    const x = d.origin[0][0] + (e.clientX - d.x0) + G.cw / 2, y = d.origin[0][1] + (e.clientY - d.y0) + G.ch / 2;
    const col = Math.max(0, Math.min(6, Math.floor((x - G.gap / 2) / (G.cw + G.gap))));
    let m = null;
    if (y < G.yTab - G.gap && col >= 3) {
      if (d.cards.length === 1) m = d.loc.area === 'tab' ? { t: 't2f', from: d.loc.col } : (d.loc.area === 'waste' ? { t: 'w2f' } : null);
    } else if (y >= G.yTab - G.gap) {
      if (d.loc.area === 'tab' && col !== d.loc.col) m = { t: 't2t', from: d.loc.col, idx: d.loc.idx, to: col };
      if (d.loc.area === 'waste') m = { t: 'w2t', to: col };
      if (d.loc.area === 'found') m = { t: 'f2t', from: d.loc.f, to: col };
    }
    if (!m || !playerMove(m)) render();
  });
  table.addEventListener('pointercancel', () => { if (drag) { drag.cards.forEach(k => cardEls[k].classList.remove('drag')); drag = null; render(); } });
  function parseTransform(t) { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t || ''); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; }
  function drawCard() { if (S.game.stock.length || S.game.waste.length) playerMove({ t: 'draw' }); }

  // ---------- Watch AI ----------
  function newAIDeal() {
    findToken++;
    S.driver = 'ai'; S.running = false; S.ai = null; S.aiJob = null; S.aiStatus = null; S.aiStuck = 0;
    overlay(''); banner('');
    S.game = new E.Game({ draw: S.draw });
    $('aiStart').textContent = 'Start'; $('aiPause').disabled = true; $('aiResult').textContent = '';
    setAIStatus('');
    render(); updateAIStats();
  }

  function setAIStatus(html) { $('aiStatus').innerHTML = html; }

  function startAI() {
    if (S.game.won() || S.aiDone) { newAIDeal(); }
    S.aiDone = false;
    S.driver = 'ai'; S.running = true; S.acc = 0;
    $('aiStart').textContent = 'Restart'; $('aiPause').disabled = false; $('aiPause').textContent = 'Pause';
    if (S.aiKind === 'solver' && !S.ai) {
      S.aiJob = new AI.Solver(S.game, 400000);
      setAIStatus('<span class="pill warn">Checking every card…</span>');
    } else if (!S.ai) S.ai = new AI.FairAI();
  }

  function aiStep() {
    const g = S.game;
    if (S.aiJob) {
      const r = S.aiJob.run(4000);
      if (!r) return;
      S.aiJob = null;
      S.aiStatus = r.status;
      if (r.status === 'win') setAIStatus(`<span class="pill good">Winnable</span> <span class="muted">Found a ${r.moves.length}-move win after checking ${r.nodes.toLocaleString()} positions.</span>`);
      else if (r.status === 'lose') setAIStatus(`<span class="pill bad">Not winnable</span> <span class="muted">Checked every possible line (${r.nodes.toLocaleString()} positions). Nobody can win this deal. It will play as far as it can.</span>`);
      else setAIStatus(`<span class="pill warn">No win found</span> <span class="muted">Checked ${r.nodes.toLocaleString()} positions without a win, so this deal is very likely unwinnable. It will play as far as it can.</span>`);
      S.ai = { plan: r.status === 'win' ? r.moves.slice() : [], decide(gg) { return this.plan.length && gg.isLegal(this.plan[0]) ? this.plan.shift() : AI.heuristicMove(gg); } };
      return;
    }
    if (!S.ai) return;
    const before = g.foundCount() * 100 - g.downCount();
    const m = S.ai.decide(g);
    g.apply(m);
    const after = g.foundCount() * 100 - g.downCount();
    S.aiStuck = after === before ? S.aiStuck + 1 : 0;
    if (g.won() || S.aiStuck > 150 || g.moves > 3000) endAI();
  }

  function endAI() {
    const g = S.game;
    S.running = false; S.aiDone = true; S.aiPlayed++;
    if (g.won()) S.aiWon++;
    $('aiStart').textContent = 'Play this deal again'; $('aiPause').disabled = true;
    const msg = g.won() ? `Won in ${g.moves} moves.` : `Stopped with ${g.foundCount()} of 52 cards home: no useful moves left.`;
    $('aiResult').textContent = msg;
    updateAIStats();
    overlay(`<h2>${g.won() ? 'AI wins!' : 'AI is stuck'}</h2><p>${msg}</p><div class="row" style="justify-content:center"><button class="btn" data-act="aiNext">New deal</button></div>`);
  }

  function updateAIStats() {
    const g = S.game;
    $('aiHome').textContent = g.foundCount();
    $('aiMoves').textContent = g.moves;
    $('aiScore').textContent = g.score;
    $('aiRecord').textContent = `${S.aiWon} / ${S.aiPlayed}`;
  }

  // ---------- Train AI ----------
  const ensureTrainer = () => (S.trainer || (S.trainer = new RL.Trainer(S.trainCfg, { draw: S.draw })));

  function setTraining(on) {
    ensureTrainer();
    S.trainRunning = on; S.replay = null; S.driver = 'train'; S.running = on; S.acc = 0;
    S.trainer.gameCfg = { draw: S.draw };
    S.game = S.trainer.game;
    overlay(''); banner(on ? '' : 'Training paused');
    $('trainStart').textContent = on ? 'Pause training' : (S.trainer.episodes.length ? 'Keep training' : 'Start training');
    render(true);
  }

  // Attempts that match the chosen mode filter
  const filtered = () => {
    const eps = S.trainer ? S.trainer.episodes : [];
    return S.modeFilter === 'all' ? eps : eps.filter(e => String(e.cfg.draw) === S.modeFilter);
  };

  function trainUI(force) {
    const now = performance.now();
    if (!force && (!S.uiDirty || now - S.lastUi < 300)) return;
    S.uiDirty = false; S.lastUi = now;
    const tr = S.trainer;
    if (!tr) return;
    const eps = filtered(), last = eps.slice(-50);
    $('trEp').textContent = eps.length;
    $('trWins').textContent = eps.filter(e => e.won).length;
    $('trAvg').textContent = last.length ? (last.reduce((a, e) => a + e.home, 0) / last.length).toFixed(1) : '0';
    $('trEps').textContent = Math.round(tr.epsilon() * 100) + '%';
    drawChart();
    renderAttempts();
    renderModeTable();
  }

  function renderModeTable() {
    const tr = S.trainer;
    if (!tr || !tr.episodes.length) return;
    const groups = new Map();
    for (const e of tr.episodes) {
      const k = String(e.cfg.draw);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    // keep the filter list in step with the modes that have been trained
    const sel = $('modeFilter');
    for (const k of groups.keys()) if (!sel.querySelector(`option[value="${k}"]`)) { const o = document.createElement('option'); o.value = k; o.textContent = MODE_NAME[k]; sel.appendChild(o); }
    $('modeTable').innerHTML = [...groups.entries()].map(([k, eps]) => {
      const wins = eps.filter(e => e.won).length, last = eps.slice(-50);
      const avg = a => (a.reduce((s, e) => s + e.home, 0) / a.length).toFixed(1);
      return `<tr><td>${MODE_NAME[k]}</td><td class="num">${eps.length}</td><td class="num">${wins}</td><td class="num">${Math.round(wins / eps.length * 100)}%</td><td class="num">${avg(eps)}</td><td class="num">${avg(last)}</td><td class="num">${Math.max(...eps.map(e => e.home))}</td></tr>`;
    }).join('');
  }
  $('modeFilter').addEventListener('change', e => { S.modeFilter = e.target.value; trainUI(true); });

  let overList = false;
  $('attempts').addEventListener('pointerenter', () => { overList = true; });
  $('attempts').addEventListener('pointerleave', () => { overList = false; });
  function renderAttempts(force) {
    const eps = filtered();
    if (!eps.length || (overList && !force)) return;
    const list = S.listView === 'best' ? eps.slice().sort((a, b) => b.home - a.home || a.steps - b.steps).slice(0, 25) : eps.slice(-150).reverse();
    $('attempts').innerHTML = list.map(e => `<tr><td class="num">${e.n}</td><td class="num">${e.home}${e.won ? ' ★' : ''}</td><td class="num">${e.steps}</td><td class="num">${e.reward}</td><td>${e.reason} · ${e.cfg.draw === 3 ? 'Hard' : 'Easy'}</td><td>${e.moves ? `<button data-ep="${e.n}">Watch</button>` : '<span class="muted">-</span>'}</td></tr>`).join('');
  }
  $('attempts').addEventListener('click', e => {
    const b = e.target.closest('button[data-ep]');
    if (b) startReplay(S.trainer.episodes[Number(b.dataset.ep) - 1]);
  });

  function startReplay(ep) {
    S.trainRunning = false;
    S.replay = { ep, i: 0 };
    S.game = new E.Game({ draw: ep.cfg.draw, seed: ep.seed });
    S.driver = 'replay'; S.running = true; S.acc = 0;
    overlay(''); banner(`Replay of attempt #${ep.n} · ${ep.home} cards home`);
    $('trainStart').textContent = 'Keep training';
    render(true);
    table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Chart: cards home for every attempt
  let chartPts = null;
  function drawChart(hover) {
    const c = $('chart'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W) return;
    c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
    const eps = filtered(), pad = { l: 30, r: 10, t: 10, b: 22 };
    const N = Math.max(eps.length, 10);
    const X = i => pad.l + i / Math.max(1, N - 1) * (W - pad.l - pad.r);
    const Y = v => H - pad.b - v / 52 * (H - pad.t - pad.b);
    x.font = '11px ' + col('--font'); x.fillStyle = col('--ink-soft'); x.strokeStyle = col('--line'); x.lineWidth = 1;
    for (const v of [0, 26, 52]) { x.beginPath(); x.moveTo(pad.l, Y(v)); x.lineTo(W - pad.r, Y(v)); x.stroke(); x.textAlign = 'right'; x.fillText(String(v), pad.l - 6, Y(v) + 4); }
    x.textAlign = 'center';
    for (const i of [0, Math.round((N - 1) / 2), N - 1]) x.fillText(String(eps[i] ? eps[i].n : i + 1), Math.min(W - pad.r - 10, Math.max(pad.l + 6, X(i))), H - 6);
    if (!eps.length) { x.fillText('Attempts will appear here', W / 2, H / 2); chartPts = null; return; }
    const r = eps.length > 400 ? 1.5 : 2.5;
    eps.forEach((e, i) => {
      if (e.won) { x.strokeStyle = col('--good'); x.lineWidth = 2; x.beginPath(); x.arc(X(i), Y(52), r + 1.5, 0, 7); x.stroke(); }
      else { x.fillStyle = col('--series-dot'); x.globalAlpha = eps.length > 400 ? 0.35 : 0.7; x.beginPath(); x.arc(X(i), Y(e.home), r, 0, 7); x.fill(); x.globalAlpha = 1; }
    });
    const avg = []; let sum = 0;
    eps.forEach((e, i) => { sum += e.home; if (i >= 50) sum -= eps[i - 50].home; avg.push(sum / Math.min(i + 1, 50)); });
    x.strokeStyle = col('--series-1'); x.lineWidth = 2; x.beginPath();
    avg.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.stroke();
    chartPts = { X, Y, avg, eps };
    if (hover != null) {
      x.strokeStyle = col('--ink-soft'); x.setLineDash([3, 3]); x.beginPath(); x.moveTo(X(hover), pad.t); x.lineTo(X(hover), H - pad.b); x.stroke(); x.setLineDash([]);
      for (const [v, cl] of [[eps[hover].home, col('--series-dot')], [avg[hover], col('--series-1')]]) { x.fillStyle = cl; x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(X(hover), Y(v), 4, 0, 7); x.fill(); x.stroke(); }
    }
  }
  $('chart').addEventListener('pointermove', e => {
    if (!chartPts) return;
    const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left;
    const n = chartPts.eps.length;
    let i = Math.round((px - 30) / Math.max(1, rect.width - 40) * (Math.max(n, 10) - 1));
    i = Math.max(0, Math.min(n - 1, i));
    drawChart(i);
    const ep = chartPts.eps[i], tip = $('tip');
    tip.hidden = false;
    tip.style.left = Math.min(rect.width - 70, Math.max(70, chartPts.X(i))) + 'px';
    tip.style.top = chartPts.Y(Math.max(ep.home, chartPts.avg[i])) + 'px';
    tip.textContent = `Attempt ${ep.n}: ${ep.home} home${ep.won ? ' (won)' : ''} · avg ${chartPts.avg[i].toFixed(1)}`;
  });
  $('chart').addEventListener('pointerleave', () => { $('tip').hidden = true; drawChart(); });

  // Training settings form
  const REWARD_LABELS = { home: 'Card sent to the top piles', reveal: 'Turning a face-down card over', fromHome: 'Taking a card back down', wasteToTable: 'Card from the stock to the table', move: 'Every move (a small minus makes it hurry)', recycle: 'Flipping the stock over again', win: 'Winning', stuck: 'Getting stuck' };
  const VISION_LABELS = { moveType: 'What kind of move it is', reveals: 'Whether the move turns a card over or empties a column', cardInfo: 'Which card moves and where to', table: 'How the table looks (stock size, face-down cards, empty columns)', progress: 'How far along the game is' };
  const LEARN_LABELS = { lr: 'Learning rate (how big each lesson is)', gamma: 'How much it cares about the future (0 to 1)', epsStart: 'Random moves at the start (1 = all random)', epsEnd: 'Random moves at the end', epsEpisodes: 'Attempts until it stops exploring', batch: 'Memories studied per move', memory: 'How many moves it remembers', targetSync: 'Moves between brain snapshots', stuckAfter: 'Moves without progress before it counts as stuck' };
  function buildTrainForm() {
    const c = S.trainCfg;
    const num = (g, k, label) => `<label class="field"><span>${label}</span><input type="number" id="tf-${g}-${k}" data-group="${g}" data-key="${k}" step="any" value="${c[g][k]}"></label>`;
    let h = '<h3>Rewards</h3>';
    for (const k in REWARD_LABELS) h += num('rewards', k, REWARD_LABELS[k]);
    h += '<p class="muted">Rewards and learning numbers change right away. Changes below the line need a new brain.</p><h3>Learning</h3>';
    for (const k in LEARN_LABELS) h += num('learn', k, LEARN_LABELS[k]);
    h += '<hr style="border:0;border-top:1px solid var(--line);width:100%"><h3>What the AI can see about each move</h3>';
    for (const k in VISION_LABELS) h += `<label class="check"><input type="checkbox" id="tf-v-${k}" data-vision="${k}" ${c.vision[k] ? 'checked' : ''}> ${VISION_LABELS[k]}</label>`;
    h += '<h3>Brain size</h3>' + num('brain', 'hidden', 'Neurons per layer') + num('brain', 'layers', 'Hidden layers (1 to 3)');
    h += '<div class="row"><button class="btn small danger" id="tf-reset">Start over with a new brain</button><button class="btn small ghost" id="tf-defaults">Restore defaults</button></div>';
    $('trainForm').innerHTML = h;
  }
  $('trainForm').addEventListener('change', e => {
    const t = e.target, c = S.trainCfg;
    if (t.dataset.group) {
      let v = Number(t.value);
      if (!isFinite(v)) return;
      if (t.dataset.group === 'brain') v = t.dataset.key === 'layers' ? Math.max(1, Math.min(3, Math.round(v))) : Math.max(4, Math.min(256, Math.round(v)));
      c[t.dataset.group][t.dataset.key] = v;
      if (S.trainer && t.dataset.group !== 'brain') { S.trainer.cfg[t.dataset.group][t.dataset.key] = v; if (t.dataset.group === 'learn') S.trainer.agent.cfg.learn[t.dataset.key] = v; }
    }
    if (t.dataset.vision) c.vision[t.dataset.vision] = t.checked;
  });
  $('trainForm').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'tf-reset') resetTrainer();
    if (b.id === 'tf-defaults') { S.trainCfg = RL.clone(RL.DEFAULTS); buildTrainForm(); }
  });
  function resetTrainer() {
    S.trainer = null; S.trainRunning = false; S.running = false;
    $('trainStart').textContent = 'Start training';
    $('attempts').innerHTML = '<tr><td colspan="6" class="muted">Press Start training. Each attempt shows up here, and you can replay any of them.</td></tr>';
    $('modeTable').innerHTML = '<tr><td colspan="7" class="muted">Train in Easy or Hard to compare them here.</td></tr>';
    for (const k of ['trEp', 'trWins', 'trAvg']) $(k).textContent = '0';
    $('trEps').textContent = '100%';
    if (S.tab === 'train') { S.game = new E.Game({ draw: S.draw }); render(true); banner('New brain ready'); }
    drawChart();
  }

  // Save / load
  function brainJSON() {
    const tr = ensureTrainer();
    return { agent: tr.agent.toJSON(), cfg: tr.cfg, history: tr.episodes.map(e => [e.home, e.steps, e.reward, e.won ? 1 : 0, e.cfg.draw]) };
  }
  function loadBrain(j) {
    S.trainCfg = RL.clone(j.cfg);
    const tr = new RL.Trainer(S.trainCfg, { draw: S.draw });
    tr.agent = RL.Agent.fromJSON(j.agent); tr.agent.cfg.learn = RL.clone(S.trainCfg.learn);
    tr.episodes = (j.history || []).map((h, i) => ({ n: i + 1, home: h[0], steps: h[1], reward: h[2], won: !!h[3], cfg: { draw: h[4] || 1 }, reason: h[3] ? 'Won!' : 'Loaded', moves: null }));
    tr.wins = tr.episodes.filter(e => e.won).length;
    tr.best = tr.episodes.reduce((m, e) => Math.max(m, e.home), 0);
    S.trainer = tr; buildTrainForm(); setTraining(false); trainUI(true);
  }
  $('brainSave').addEventListener('click', () => { $('brainMsg').textContent = store.set('sollab.brain', brainJSON()) ? 'Saved in this browser.' : 'This browser blocked saving. Use Copy brain as text instead.'; });
  $('brainLoad').addEventListener('click', () => {
    const j = store.get('sollab.brain', null);
    if (!j) { $('brainMsg').textContent = 'No saved brain in this browser yet.'; return; }
    try { loadBrain(j); $('brainMsg').textContent = 'Loaded.'; } catch (e) { $('brainMsg').textContent = 'That saved brain could not be read.'; }
  });
  $('brainCopy').addEventListener('click', () => {
    const text = JSON.stringify(brainJSON());
    $('brainText').value = text;
    const fallback = () => { $('brainText').select(); $('brainMsg').textContent = 'Text selected below. Copy it with Ctrl+C or long-press.'; };
    try { navigator.clipboard.writeText(text).then(() => { $('brainMsg').textContent = 'Copied. Paste it somewhere safe.'; }, fallback); } catch (e) { fallback(); }
  });
  $('brainPaste').addEventListener('click', () => {
    try { loadBrain(JSON.parse($('brainText').value)); $('brainMsg').textContent = 'Loaded from text.'; } catch (e) { $('brainMsg').textContent = 'That text is not a valid brain. Copy it again and paste the whole thing.'; }
  });

  // ---------- Main loop ----------
  const delay = () => S.driver === 'ai' ? S.aiDelay : (S.driver === 'train' ? (S.trainView === 'fast' ? 0 : 150) : 200);

  function doTick() {
    if (S.driver === 'ai') aiStep();
    else if (S.driver === 'train') { if (S.trainer.tick()) S.uiDirty = true; S.game = S.trainer.game; }
    else if (S.driver === 'replay') {
      const r = S.replay;
      if (r.i < r.ep.moves.length) S.game.apply(E.decode(r.ep.moves[r.i++]));
      if (r.i >= r.ep.moves.length) {
        S.running = false;
        overlay(`<h2>Attempt #${r.ep.n}</h2><p>${r.ep.home} cards home · ${r.ep.reason}</p><button class="btn" data-act="replayAgain">Watch again</button>`);
      }
    }
  }

  function frame(now) {
    const dt = Math.min(250, now - S.last); S.last = now;
    let fast = false;
    if (S.running) {
      const d = delay();
      if (d === 0 || (S.driver === 'ai' && S.aiJob)) {
        fast = d === 0;
        const end = performance.now() + 14;
        while (S.running && performance.now() < end) doTick();
        S.acc = 0;
      } else {
        S.acc += dt;
        let n = 0;
        while (S.running && S.acc >= d && n < 20) { S.acc -= d; doTick(); n++; }
      }
      render(fast);
      if (S.driver === 'ai') updateAIStats();
    }
    if (S.driver === 'player' && S.started && !S.finished) updateBar();
    if (S.driver === 'train' || S.driver === 'replay') trainUI(false);
    requestAnimationFrame(frame);
  }

  // ---------- Buttons and tabs ----------
  const actions = {
    newGame: () => newPlayerGame(),
    aiNext: () => { newAIDeal(); startAI(); },
    replayAgain: () => startReplay(S.replay.ep),
  };
  function segment(id, fn, attr) {
    const el = $(id);
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      fn(b.dataset[attr || 'v']);
    });
  }
  segment('difficulty', v => { S.draw = Number(v); store.set('sollab.settings', { draw: S.draw, dealType: S.dealType }); setTab(S.tab); });
  segment('dealType', v => { S.dealType = v; store.set('sollab.settings', { draw: S.draw, dealType: S.dealType }); if (S.tab === 'play') newPlayerGame(); });
  segment('aiKind', v => { S.aiKind = v; newAIDeal(); }, 'kind');
  segment('aiSpeed', v => { S.aiDelay = Number(v); S.acc = 0; });
  segment('trainView', v => { S.trainView = v; S.acc = 0; });
  segment('listView', v => { S.listView = v; renderAttempts(true); });
  $('newGame').addEventListener('click', () => setTab(S.tab));
  $('undo').addEventListener('click', () => { if (S.driver === 'player' && S.game.undo()) { S.finishing = false; render(); } });
  $('aiStart').addEventListener('click', () => {
    if (S.aiDone && !S.game.won()) { const seed = S.game.seed; S.game = new E.Game({ draw: S.draw, seed }); S.ai = null; S.aiJob = null; S.aiDone = false; overlay(''); render(true); }
    else if (S.running || S.game.moves) { const seed = S.game.seed; S.game = new E.Game({ draw: S.draw, seed }); S.ai = null; overlay(''); render(true); }
    startAI();
  });
  $('aiPause').addEventListener('click', () => { if (S.aiDone) return; S.running = !S.running; $('aiPause').textContent = S.running ? 'Pause' : 'Resume'; });
  $('aiNext').addEventListener('click', () => { newAIDeal(); });
  $('trainStart').addEventListener('click', () => setTraining(!(S.driver === 'train' && S.trainRunning)));

  function setTab(tab) {
    S.tab = tab; S.running = false; S.trainRunning = false; S.finishing = false; findToken++;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    for (const t of ['play', 'ai', 'train']) $('panel-' + t).hidden = t !== tab;
    overlay(''); banner('');
    if (tab === 'play') newPlayerGame();
    if (tab === 'ai') newAIDeal();
    if (tab === 'train') {
      S.driver = 'train';
      if (S.trainer) { S.trainer.gameCfg = { draw: S.draw }; S.game = S.trainer.game; banner('Training paused'); }
      else S.game = new E.Game({ draw: S.draw });
      $('trainStart').textContent = S.trainer && S.trainer.episodes.length ? 'Keep training' : 'Start training';
      render(true); trainUI(true);
    }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); $('undo').click(); }
  });

  // Start
  document.querySelectorAll('#difficulty button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === S.draw)));
  document.querySelectorAll('#dealType button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.dealType)));
  buildTrainForm();
  new ResizeObserver(() => { geometry(); render(true); drawChart(); }).observe(table);
  setTab('play');
  requestAnimationFrame(frame);
})();
