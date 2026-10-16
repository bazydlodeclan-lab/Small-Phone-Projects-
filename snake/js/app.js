/* Connects the game, the AIs and the page together. */
(function () {
  'use strict';
  const E = window.SnakeEngine, AI = window.SnakeAI, RL = window.SnakeRL, R = window.SnakeRender;
  const $ = id => document.getElementById(id);

  // ---------- Saved preferences (only in this browser) ----------
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  const validModes = new Set(E.MODES.map(m => m.id));
  const saved = store.get('snakelab.settings', {});
  const settings = {
    modes: Array.isArray(saved.modes) && saved.modes.length && saved.modes.every(m => validModes.has(m)) ? saved.modes : ['classic'],
    apples: E.APPLE_COUNTS.some(a => a.id === saved.apples) ? saved.apples : 1,
    speed: E.SPEEDS[saved.speed] ? saved.speed : 'normal',
    size: E.SIZES[saved.size] ? saved.size : 'standard',
    blender: !!saved.blender,
  };
  const gameCfg = () => ({ size: settings.size, apples: settings.apples, speed: settings.speed, modes: settings.modes.slice() });
  const settingsKey = () => [settings.size, settings.apples, settings.speed, settings.modes.slice().sort().join('+')].join('|');
  const bestScores = store.get('snakelab.best', {});

  // ---------- App state ----------
  const S = {
    tab: 'play',
    game: new E.Game(gameCfg()),
    driver: 'player',   // who moves the snake: player, ai, train, replay
    running: false,
    waiting: true,      // player game waiting for the first key
    queue: [],
    acc: 0, last: performance.now(),
    ai: null, aiKind: 'perfect', aiSpeed: 1,
    trainer: null, trainCfg: RL.clone(RL.DEFAULTS), trainView: 'live', trainRunning: false,
    replay: null, listView: 'latest', uiDirty: true, lastUi: 0,
  };

  const canvas = $('board'), ctx = canvas.getContext('2d');
  R.appleIcon($('appleIcon'));

  // ---------- Board size ----------
  function resize() {
    const g = S.game, wrap = $('boardWrap');
    // keep the whole board on screen on short windows
    const maxH = Math.max(220, window.innerHeight - 190);
    const maxW = Math.floor(maxH * g.w / g.h) + 20;
    wrap.style.maxWidth = maxW + 'px';
    const w = canvas.clientWidth;
    const h = Math.round(w * g.h / g.w);
    canvas.style.height = h + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  window.addEventListener('resize', resize);

  // ---------- Overlay messages on the board ----------
  function overlay(html, cls) {
    const o = $('overlay');
    if (!html) { o.hidden = true; o.innerHTML = ''; return; }
    o.className = 'overlay' + (cls ? ' ' + cls : '');
    o.innerHTML = '<div class="box">' + html + '</div>';
    o.hidden = false;
    const b = o.querySelector('[data-act]');
    if (b) b.addEventListener('click', () => actions[b.dataset.act]());
  }
  function banner(text) { const b = $('banner'); b.hidden = !text; b.textContent = text || ''; }

  function modeNames(modes) {
    return modes.map(id => { const m = E.MODES.find(x => x.id === id); return m.name + (E.APPROXIMATE_MODES.includes(id) ? '*' : ''); }).join(' + ');
  }
  function summary() {
    const apples = E.APPLE_COUNTS.find(a => a.id === settings.apples).label;
    return `${modeNames(settings.modes)} · ${E.SIZES[settings.size].label} · ${apples} apple${apples === '1' ? '' : 's'} · ${E.SPEEDS[settings.speed].label}`;
  }

  function updateScore() {
    $('score').textContent = S.game.score;
    $('best').textContent = bestScores[settingsKey()] || 0;
  }

  function updateInfo() {
    $('modeinfo').textContent = summary();
    $('playSummary').textContent = summary();
    $('playModeDesc').textContent = settings.modes.map(id => E.MODES.find(m => m.id === id).desc).join(' ');
    $('approxNote').hidden = !settings.modes.some(id => E.APPROXIMATE_MODES.includes(id));
    updateAIBadge();
  }

  // ---------- Player ----------
  function newPlayerGame() {
    S.game = new E.Game(gameCfg());
    S.driver = 'player'; S.running = false; S.waiting = true; S.queue = [];
    resize(); updateScore(); banner('');
    overlay('<p>Press an arrow key or swipe to start</p>', 'hint');
  }

  function playerKey(d) {
    if (S.driver !== 'player') return;
    if (S.game.over) return;
    if (S.waiting) {
      S.waiting = false; S.running = true; overlay('');
      S.acc = tickMs(); // move straight away
    }
    const sn = S.game.snakes[0];
    const last = S.queue.length ? S.queue[S.queue.length - 1] : sn.dir;
    if (d === last) return;
    if (sn.poison === 0 && d === (last + 2) % 4) return;
    if (S.queue.length < 3) S.queue.push(d);
  }

  function endPlayerGame() {
    S.running = false;
    const g = S.game, key = settingsKey();
    let newBest = false;
    if (g.score > (bestScores[key] || 0)) { bestScores[key] = g.score; store.set('snakelab.best', bestScores); newBest = true; }
    updateScore();
    const title = g.won ? 'You win!' : 'Game over';
    overlay(`<h2>${title}</h2><p>Score ${g.score}${newBest ? ' · new best' : ''}</p><p class="muted" style="color:#dfe8d6">${g.won ? 'You filled the board.' : g.reason}</p><button class="btn" data-act="restart">Play again</button>`);
  }

  // ---------- Watch AI ----------
  function newAIGame() {
    S.game = new E.Game(gameCfg());
    S.ai = AI.createAI(S.aiKind, S.game);
    S.driver = 'ai'; S.running = false;
    resize(); updateScore(); updateAIStats(); banner('');
    $('aiResult').textContent = '';
    overlay('<p>Press Start to watch the AI play</p>', 'hint');
    $('aiStart').textContent = 'Start'; $('aiPause').disabled = true;
  }

  function updateAIBadge() {
    const g = new E.Game(Object.assign(gameCfg(), { seed: 1 }));
    const sure = S.aiKind === 'perfect' && AI.cycleCompatible(g);
    let html;
    if (S.aiKind === 'perfect') {
      html = sure
        ? '<span class="pill good">Guaranteed win in this mode</span>'
        : '<span class="pill warn">Best effort in this mode</span> <span class="muted">Obstacles can trap any player here, so it plays as safely as it can but cannot promise a win.</span>';
    } else html = '<span class="pill warn">Takes risks</span> <span class="muted">Fast while short, careful once the board fills up.</span>';
    $('aiBadge').innerHTML = html;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}.${String(Math.floor(ms % 1000 / 100))}`;
  }

  function updateAIStats() {
    const g = S.game;
    const cells = g.snakes.reduce((t, s) => t + s.cells.length, 0);
    $('aiApples').textContent = g.score;
    $('aiFill').textContent = Math.round(cells / g.n * 100) + '%';
    $('aiMoves').textContent = g.steps;
    $('aiTime').textContent = fmtTime(g.steps * E.SPEEDS[settings.speed].ms);
  }

  function endAIGame() {
    S.running = false;
    const g = S.game;
    updateAIStats();
    $('aiStart').textContent = 'Run again'; $('aiPause').disabled = true;
    const msg = g.won
      ? `Beat the game: ${g.score} apples in ${g.steps} moves (${fmtTime(g.steps * E.SPEEDS[settings.speed].ms)} of game time).`
      : (g.over ? `Died after ${g.score} apples: ${g.reason}.` : `Stopped after ${g.score} apples.`);
    $('aiResult').textContent = msg;
    overlay(`<h2>${g.won ? 'AI wins!' : 'AI lost'}</h2><p>${msg}</p><button class="btn" data-act="aiAgain">Run again</button>`);
  }

  // ---------- Train AI ----------
  function ensureTrainer() {
    if (!S.trainer) S.trainer = new RL.Trainer(S.trainCfg, gameCfg());
    return S.trainer;
  }

  function showTrainerGame() {
    if (!S.trainer) { S.game = new E.Game(gameCfg()); return; }
    S.game = S.trainer.game;
  }

  function setTraining(on) {
    ensureTrainer();
    S.trainRunning = on;
    S.replay = null;
    S.driver = 'train';
    showTrainerGame();
    S.running = on;
    banner(on ? '' : 'Training paused');
    overlay('');
    $('trainStart').textContent = on ? 'Pause training' : (S.trainer.episodes.length ? 'Keep training' : 'Start training');
    resize(); updateScore();
  }

  function onEpisode() { S.uiDirty = true; }

  function trainUI(force) {
    const tr = S.trainer;
    const now = performance.now();
    if (!force && (!S.uiDirty || now - S.lastUi < 300)) return;
    S.uiDirty = false; S.lastUi = now;
    if (!tr) return;
    const eps = tr.episodes;
    const last = eps.slice(-50);
    $('trEp').textContent = eps.length;
    $('trBest').textContent = tr.best;
    $('trAvg').textContent = last.length ? (last.reduce((a, e) => a + e.score, 0) / last.length).toFixed(1) : '0';
    $('trEps').textContent = Math.round(tr.epsilon() * 100) + '%';
    drawChart();
    renderAttempts();
  }

  // Don't rebuild the list while the pointer is over it, so Watch buttons stay clickable
  let overList = false;
  $('attempts').addEventListener('pointerenter', () => { overList = true; });
  $('attempts').addEventListener('pointerleave', () => { overList = false; });

  function renderAttempts(force) {
    const tr = S.trainer, body = $('attempts');
    if (!tr || !tr.episodes.length || (overList && !force)) return;
    let list;
    if (S.listView === 'best') list = tr.episodes.slice().sort((a, b) => b.score - a.score || a.steps - b.steps).slice(0, 25);
    else list = tr.episodes.slice(-150).reverse();
    body.innerHTML = list.map(e => `<tr><td class="num">${e.n}</td><td class="num">${e.score}</td><td class="num">${e.steps}</td><td class="num">${e.reward}</td><td>${esc(e.reason)}</td><td>${e.moves ? `<button data-ep="${e.n}">Watch</button>` : '<span class="muted">-</span>'}</td></tr>`).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  $('attempts').addEventListener('click', e => {
    const b = e.target.closest('button[data-ep]');
    if (!b) return;
    const ep = S.trainer.episodes[Number(b.dataset.ep) - 1];
    startReplay(ep);
  });

  function startReplay(ep) {
    S.trainRunning = false;
    S.replay = { ep, i: 0 };
    S.game = new E.Game(Object.assign({}, ep.cfg, { seed: ep.seed }));
    S.driver = 'replay'; S.running = true; S.acc = 0;
    resize(); updateScore(); overlay('');
    banner(`Replay of attempt #${ep.n} · score ${ep.score}`);
    $('trainStart').textContent = 'Keep training';
    canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function endReplay() {
    S.running = false;
    const ep = S.replay.ep;
    overlay(`<h2>Attempt #${ep.n}</h2><p>Score ${ep.score} · ${esc(ep.reason)}</p><button class="btn" data-act="replayAgain">Watch again</button>`);
  }

  // ---------- Chart: score of every attempt ----------
  let chartPts = null;
  function drawChart(hover) {
    const c = $('chart'), tr = S.trainer;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W) return;
    c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();
    const eps = tr ? tr.episodes : [];
    const pad = { l: 34, r: 10, t: 10, b: 22 };
    const N = Math.max(eps.length, 10);
    let maxY = 5;
    for (const e of eps) if (e.score > maxY) maxY = e.score;
    maxY = niceCeil(maxY);
    const X = i => pad.l + (i - 1) / Math.max(1, N - 1) * (W - pad.l - pad.r);
    const Y = v => H - pad.b - v / maxY * (H - pad.t - pad.b);
    // grid + axis labels
    x.font = '11px ' + col('--font');
    x.fillStyle = col('--ink-soft'); x.strokeStyle = col('--line'); x.lineWidth = 1;
    for (const v of [0, maxY / 2, maxY]) {
      x.beginPath(); x.moveTo(pad.l, Y(v)); x.lineTo(W - pad.r, Y(v)); x.stroke();
      x.textAlign = 'right'; x.fillText(String(Math.round(v)), pad.l - 6, Y(v) + 4);
    }
    x.textAlign = 'center';
    for (const i of [1, Math.round(N / 2), N]) x.fillText(String(i), Math.min(W - pad.r - 8, Math.max(pad.l + 4, X(i))), H - 6);
    if (!eps.length) { x.fillText('Attempts will appear here', W / 2, H / 2); chartPts = null; return; }
    // each attempt
    x.fillStyle = col('--series-dot'); x.globalAlpha = eps.length > 400 ? 0.35 : 0.7;
    const r = eps.length > 400 ? 1.5 : 2.5;
    for (const e of eps) { x.beginPath(); x.arc(X(e.n), Y(e.score), r, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    // average of last 50 + best so far
    const avg = [], best = [];
    let sum = 0, b = 0;
    eps.forEach((e, i) => {
      sum += e.score; if (i >= 50) sum -= eps[i - 50].score;
      avg.push(sum / Math.min(i + 1, 50));
      b = Math.max(b, e.score); best.push(b);
    });
    const line = (arr, color, step) => {
      x.strokeStyle = color; x.lineWidth = 2; x.lineJoin = 'round'; x.beginPath();
      arr.forEach((v, i) => {
        const px = X(i + 1), py = Y(v);
        if (i === 0) x.moveTo(px, py);
        else if (step) { x.lineTo(px, Y(arr[i - 1])); x.lineTo(px, py); } else x.lineTo(px, py);
      });
      x.stroke();
    };
    line(best, col('--series-2'), true);
    line(avg, col('--series-1'), false);
    chartPts = { X, Y, avg, best, eps, W };
    if (hover != null) {
      const i = hover - 1;
      x.strokeStyle = col('--ink-soft'); x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(X(hover), pad.t); x.lineTo(X(hover), H - pad.b); x.stroke(); x.setLineDash([]);
      for (const [v, cl] of [[eps[i].score, col('--series-dot')], [avg[i], col('--series-1')], [best[i], col('--series-2')]]) {
        x.fillStyle = cl; x.strokeStyle = '#fff'; x.lineWidth = 2;
        x.beginPath(); x.arc(X(hover), Y(v), 4, 0, 7); x.fill(); x.stroke();
      }
    }
  }
  function niceCeil(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p; return v; }

  $('chart').addEventListener('pointermove', e => {
    if (!chartPts) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const eps = chartPts.eps;
    // find the attempt nearest the pointer
    let lo = 1, hi = eps.length, best = 1, bd = Infinity;
    for (let n = lo; n <= hi; n += Math.max(1, Math.floor(eps.length / 400))) { const d = Math.abs(chartPts.X(n) - px); if (d < bd) { bd = d; best = n; } }
    for (let n = Math.max(1, best - 3); n <= Math.min(hi, best + 3); n++) { const d = Math.abs(chartPts.X(n) - px); if (d < bd) { bd = d; best = n; } }
    drawChart(best);
    const i = best - 1, tip = $('tip');
    tip.hidden = false;
    tip.style.left = Math.min(rect.width - 60, Math.max(60, chartPts.X(best))) + 'px';
    tip.style.top = chartPts.Y(chartPts.best[i]) + 'px';
    tip.textContent = `Attempt ${best}: score ${eps[i].score} · avg ${chartPts.avg[i].toFixed(1)} · best ${chartPts.best[i]}`;
  });
  $('chart').addEventListener('pointerleave', () => { $('tip').hidden = true; drawChart(); });

  // ---------- Training settings form ----------
  const REWARD_LABELS = {
    eat: 'Eating an apple', die: 'Dying', win: 'Filling the whole board', closer: 'Moving closer to the apple',
    farther: 'Moving away from the apple', step: 'Every move (a small minus makes it hurry)', timeout: 'Going in circles too long',
  };
  const VISION_LABELS = {
    danger: 'Danger sense: would each move kill me?', space: 'Room sense: how much space is left after each move',
    food: 'Apple compass: which way is the nearest apple', direction: 'Which way am I facing',
    tail: 'Tail compass: which way is my tail', length: 'How long am I',
  };
  const LEARN_LABELS = {
    lr: 'Learning rate (how big each lesson is)', gamma: 'How much it cares about the future (0 to 1)',
    epsStart: 'Random moves at the start (1 = all random)', epsEnd: 'Random moves at the end',
    epsEpisodes: 'Attempts until it stops exploring', batch: 'Memories studied per move',
    memory: 'How many moves it remembers', targetSync: 'Moves between brain snapshots',
  };

  function buildTrainForm() {
    const c = S.trainCfg;
    const num = (group, key, label, step) => `<label class="field"><span>${label}</span><input type="number" id="tf-${group}-${key}" data-group="${group}" data-key="${key}" step="${step}" value="${c[group][key]}"></label>`;
    let h = '<h3>Rewards (what it gets for each thing)</h3>';
    for (const k of Object.keys(REWARD_LABELS)) h += num('rewards', k, REWARD_LABELS[k], 'any');
    h += '<p class="muted">Rewards and learning numbers change right away. Changes below the line need a new brain.</p>';
    h += '<h3>Learning</h3>';
    for (const k of Object.keys(LEARN_LABELS)) h += num('learn', k, LEARN_LABELS[k], 'any');
    h += '<hr style="border:0;border-top:1px solid var(--line);width:100%"><h3>What the AI can see</h3>';
    for (const k of Object.keys(VISION_LABELS)) h += `<label class="check"><input type="checkbox" id="tf-vision-${k}" data-vision="${k}" ${c.vision[k] ? 'checked' : ''}> ${VISION_LABELS[k]}</label>`;
    h += `<h3>Controls</h3><div class="seg" id="tf-actions">
      <button data-v="relative" aria-pressed="${c.actions === 'relative'}">Left / straight / right</button>
      <button data-v="absolute" aria-pressed="${c.actions === 'absolute'}">Up / down / left / right</button></div>`;
    h += '<h3>Brain size</h3>' + num('brain', 'hidden', 'Neurons per layer', 1) + num('brain', 'layers', 'Hidden layers (1 to 3)', 1);
    h += '<div class="row"><button class="btn small danger" id="tf-reset">Start over with a new brain</button><button class="btn small ghost" id="tf-defaults">Restore defaults</button></div>';
    $('trainForm').innerHTML = h;
  }

  $('trainForm').addEventListener('change', e => {
    const t = e.target, c = S.trainCfg;
    if (t.dataset.group) {
      let v = Number(t.value);
      if (!isFinite(v)) return;
      if (t.dataset.group === 'brain') v = t.dataset.key === 'layers' ? Math.max(1, Math.min(3, Math.round(v))) : Math.max(4, Math.min(512, Math.round(v)));
      c[t.dataset.group][t.dataset.key] = v;
      if (S.trainer && (t.dataset.group === 'rewards' || t.dataset.group === 'learn')) {
        S.trainer.cfg[t.dataset.group][t.dataset.key] = v;
        if (t.dataset.group === 'learn') S.trainer.agent.cfg.learn[t.dataset.key] = v;
      }
    }
    if (t.dataset.vision) c.vision[t.dataset.vision] = t.checked;
  });
  $('trainForm').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v) { S.trainCfg.actions = b.dataset.v; buildTrainForm(); return; }
    if (b.id === 'tf-reset') resetTrainer();
    if (b.id === 'tf-defaults') { S.trainCfg = RL.clone(RL.DEFAULTS); buildTrainForm(); }
  });

  function resetTrainer() {
    S.trainer = null; S.trainRunning = false;
    if (S.tab === 'train') { S.driver = 'train'; S.running = false; S.game = new E.Game(gameCfg()); resize(); banner(''); overlay('<p>New brain ready. Press Start training.</p>', 'hint'); }
    $('trainStart').textContent = 'Start training';
    $('attempts').innerHTML = '<tr><td colspan="6" class="muted">Press Start training. Each attempt shows up here, and you can replay any of them.</td></tr>';
    trainUIReset();
  }
  function trainUIReset() { $('trEp').textContent = '0'; $('trBest').textContent = '0'; $('trAvg').textContent = '0'; $('trEps').textContent = '100%'; drawChart(); }

  // ---------- Save / load the brain ----------
  function brainJSON() {
    const tr = ensureTrainer();
    return {
      agent: tr.agent.toJSON(), cfg: tr.cfg,
      history: tr.episodes.map(e => [e.score, e.steps, e.reward, e.won ? 1 : 0]),
    };
  }
  function loadBrain(j) {
    S.trainCfg = RL.clone(j.cfg);
    const tr = new RL.Trainer(S.trainCfg, gameCfg());
    tr.agent = RL.Agent.fromJSON(j.agent);
    tr.agent.cfg.learn = RL.clone(S.trainCfg.learn);
    tr.episodes = (j.history || []).map((h, i) => ({ n: i + 1, score: h[0], steps: h[1], reward: h[2], won: !!h[3], reason: h[3] ? 'Won!' : 'Loaded', moves: null, eps: 0 }));
    tr.best = tr.episodes.reduce((m, e) => Math.max(m, e.score), 0);
    tr.startEpisode();
    S.trainer = tr;
    buildTrainForm();
    setTraining(false);
    trainUI(true);
  }
  $('brainSave').addEventListener('click', () => {
    $('brainMsg').textContent = store.set('snakelab.brain', brainJSON()) ? 'Saved in this browser.' : 'This browser blocked saving. Use Copy brain as text instead.';
  });
  $('brainLoad').addEventListener('click', () => {
    const j = store.get('snakelab.brain', null);
    if (!j) { $('brainMsg').textContent = 'No saved brain in this browser yet.'; return; }
    try { loadBrain(j); $('brainMsg').textContent = 'Loaded.'; } catch (e) { $('brainMsg').textContent = 'That saved brain could not be read.'; }
  });
  $('brainCopy').addEventListener('click', () => {
    const text = JSON.stringify(brainJSON());
    $('brainText').value = text;
    const done = () => { $('brainMsg').textContent = 'Copied. Paste it somewhere safe.'; };
    const fallback = () => { $('brainText').select(); $('brainMsg').textContent = 'Text selected below. Copy it with Ctrl+C or long-press.'; };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  });
  $('brainPaste').addEventListener('click', () => {
    try { loadBrain(JSON.parse($('brainText').value)); $('brainMsg').textContent = 'Loaded from text.'; } catch (e) { $('brainMsg').textContent = 'That text is not a valid brain. Copy it again and paste the whole thing.'; }
  });

  // ---------- Main loop ----------
  function tickMs() {
    const base = E.SPEEDS[settings.speed].ms;
    if (S.driver === 'ai') return S.aiSpeed === 'max' ? base : base / S.aiSpeed;
    return base;
  }
  const fastMode = () => (S.driver === 'ai' && S.aiSpeed === 'max') || (S.driver === 'train' && S.trainView === 'fast');

  function doTick() {
    const g = S.game;
    if (S.driver === 'player') {
      const d = S.queue.length ? S.queue.shift() : -1;
      g.step(d);
      updateScore();
      if (g.over) endPlayerGame();
    } else if (S.driver === 'ai') {
      g.step(S.ai.decide(g));
      if (g.over || g.steps > 2000000) endAIGame();
    } else if (S.driver === 'train') {
      if (S.trainer.tick()) onEpisode();
      S.game = S.trainer.game;
    } else if (S.driver === 'replay') {
      const r = S.replay;
      if (r.i < r.ep.moves.length) g.step(r.ep.moves[r.i++]);
      updateScore();
      if (g.over || r.i >= r.ep.moves.length) endReplay();
    }
  }

  function frame(now) {
    const dt = Math.min(250, now - S.last);
    S.last = now;
    if (S.running) {
      if (fastMode()) {
        const end = performance.now() + 14;
        while (S.running && performance.now() < end) doTick();
        S.acc = 0;
      } else {
        S.acc += dt;
        const ms = tickMs();
        let n = 0;
        while (S.running && S.acc >= ms && n < 40) { S.acc -= ms; doTick(); n++; }
        if (n >= 40) S.acc = 0;
      }
    }
    if (S.driver === 'ai') { updateAIStats(); $('score').textContent = S.game.score; }
    if (S.driver === 'train' || S.driver === 'replay') { updateScore(); trainUI(false); }
    const alpha = (S.running && !fastMode()) ? S.acc / tickMs() : 1;
    if (canvas.width && canvas.height) R.draw(ctx, S.game, alpha);
    requestAnimationFrame(frame);
  }

  // ---------- Buttons ----------
  const actions = {
    restart: () => newPlayerGame(),
    aiAgain: () => { newAIGame(); startAI(); },
    replayAgain: () => startReplay(S.replay.ep),
  };

  function startAI() {
    if (!S.game || S.game.over || S.driver !== 'ai') newAIGame();
    S.running = true; overlay('');
    $('aiStart').textContent = 'Restart'; $('aiPause').disabled = false; $('aiPause').textContent = 'Pause';
  }
  $('aiStart').addEventListener('click', () => { if (S.running || S.game.steps > 0) newAIGame(); startAI(); });
  $('aiPause').addEventListener('click', () => {
    if (S.game.over) return;
    S.running = !S.running;
    $('aiPause').textContent = S.running ? 'Pause' : 'Resume';
  });
  segment('aiKind', v => { S.aiKind = v; updateAIBadge(); newAIGame(); }, 'kind');
  segment('aiSpeed', v => { S.aiSpeed = v === 'max' ? 'max' : Number(v); S.acc = 0; });
  segment('trainView', v => { S.trainView = v; S.acc = 0; });
  segment('listView', v => { S.listView = v; renderAttempts(true); });

  $('trainStart').addEventListener('click', () => setTraining(!(S.driver === 'train' && S.trainRunning)));
  $('playStart').addEventListener('click', () => { newPlayerGame(); playerKey(1); });

  function segment(id, fn, attr) {
    const el = $(id);
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      fn(b.dataset[attr || 'v']);
    });
  }

  // ---------- Tabs ----------
  function setTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    for (const t of ['play', 'ai', 'train']) $('panel-' + t).hidden = t !== tab;
    $('dpad').classList.toggle('show', tab === 'play');
    S.running = false; S.trainRunning = false; overlay(''); banner('');
    if (tab === 'play') newPlayerGame();
    if (tab === 'ai') newAIGame();
    if (tab === 'train') {
      S.driver = 'train';
      if (S.trainer) { showTrainerGame(); banner('Training paused'); }
      else { S.game = new E.Game(gameCfg()); overlay('<p>Press Start training below</p>', 'hint'); }
      $('trainStart').textContent = S.trainer && S.trainer.episodes.length ? 'Keep training' : 'Start training';
      resize(); updateScore(); trainUI(true);
    }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ---------- Keyboard, swipe, arrow buttons ----------
  const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  document.addEventListener('keydown', e => {
    if (!$('settingsBack').hidden) { if (e.key === 'Escape') closeSettings(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (S.tab !== 'play') return;
    if (e.code in KEYS) { e.preventDefault(); playerKey(KEYS[e.code]); }
    else if (e.code === 'Space' || e.code === 'Enter') { if (S.game.over) { e.preventDefault(); newPlayerGame(); } }
  });
  let touch = null;
  canvas.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!touch || S.tab !== 'play') return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    playerKey(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });
  $('dpad').addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();
    playerKey(Number(b.dataset.dir));
  });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

  // ---------- Settings sheet ----------
  let lastMode = settings.modes[settings.modes.length - 1];
  function buildSettings() {
    $('blender').checked = settings.blender;
    $('modeGrid').innerHTML = E.MODES.map(m => `<button data-mode="${m.id}" aria-pressed="${settings.modes.includes(m.id)}">${m.name}${E.APPROXIMATE_MODES.includes(m.id) ? '<sup>*</sup>' : ''}</button>`).join('');
    const m = E.MODES.find(x => x.id === lastMode);
    $('modeDesc').innerHTML = `<b>${m.name}.</b> ${m.desc}${E.APPROXIMATE_MODES.includes(m.id) ? ' <span class="muted">* Rules based on fan descriptions; may differ slightly from Google.</span>' : ''}`;
    const seg = (id, list, cur, key) => {
      $(id).innerHTML = list.map(o => `<button data-${key}="${o.id}" aria-pressed="${String(o.id) === String(cur)}">${o.label}</button>`).join('');
    };
    seg('setApples', E.APPLE_COUNTS, settings.apples, 'apples');
    seg('setSpeed', Object.keys(E.SPEEDS).map(k => ({ id: k, label: E.SPEEDS[k].label })), settings.speed, 'speed');
    seg('setSize', Object.keys(E.SIZES).map(k => ({ id: k, label: `${E.SIZES[k].label} (${E.SIZES[k].w}×${E.SIZES[k].h})` })), settings.size, 'size');
  }
  function openSettings() { S.wasRunning = S.running; S.running = false; buildSettings(); $('settingsBack').hidden = false; $('settingsDone').focus(); }
  function closeSettings() {
    $('settingsBack').hidden = true;
    store.set('snakelab.settings', settings);
    updateInfo();
    if (S.trainer) S.trainer.gameCfg = gameCfg(); // new attempts use the new settings
    setTab(S.tab);
  }
  $('openSettings').addEventListener('click', openSettings);
  $('playSettings').addEventListener('click', openSettings);
  $('settingsDone').addEventListener('click', closeSettings);
  $('settingsBack').addEventListener('click', e => { if (e.target.id === 'settingsBack') closeSettings(); });
  $('blender').addEventListener('change', e => {
    settings.blender = e.target.checked;
    if (!settings.blender) settings.modes = [lastMode];
    buildSettings();
  });
  $('modeGrid').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.mode;
    lastMode = id;
    if (settings.blender) {
      const i = settings.modes.indexOf(id);
      if (i >= 0) settings.modes.splice(i, 1); else settings.modes.push(id);
      if (!settings.modes.length) settings.modes = ['classic'];
    } else settings.modes = [id];
    buildSettings();
  });
  for (const [id, key, conv] of [['setApples', 'apples', v => v === 'dice' ? 'dice' : Number(v)], ['setSpeed', 'speed', v => v], ['setSize', 'size', v => v]]) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      settings[key] = conv(b.dataset[key]);
      buildSettings();
    });
  }

  // ---------- Start ----------
  buildTrainForm();
  updateInfo();
  setTab('play');
  new ResizeObserver(() => { resize(); drawChart(); }).observe($('boardWrap'));
  requestAnimationFrame(frame);
})();
