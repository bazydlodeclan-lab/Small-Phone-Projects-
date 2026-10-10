// =====================================================
// GRAVE RIDER — GAME LOOP, CAMERA, INPUT, HUD
// =====================================================
var Game = (function () {
  var Vec2 = planck.Vec2;
  var PPM = CONFIG.pixelsPerMetre; // pixels per metre

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var viewW = 0, viewH = 0;

  // Planck stops any body turning more than a quarter turn per step (94 rad/s
  // at 60 Hz). The rear wheel needs 118 rad/s at top speed, so allow half a
  // turn per step; otherwise the motor's extra push leaks into the frame.
  planck.Settings.maxRotation = Math.PI;
  var world = planck.World({ gravity: Vec2(0, 9.81) });

  // Everything about the current run lives in "state"
  var state = {
    levelIndex: 0,
    level: null,
    bike: null,
    mode: "ready",        // ready (waiting for your first control press) | playing | crashed | finished
    timeMs: 0,            // the clock: starts on your first control press, keeps running through crashes
    runSteps: 0,          // physics steps since the clock started
    flipBonusMs: 0,       // time taken off for flips (your time = clock - flip bonus)
    backflips: 0,
    frontflips: 0,
    checkpoint: null,     // where you respawn after a crash
    checkpointIndex: -1,
    splits: [],           // your time at each checkpoint this run
    crashTimerMs: 0,
    crashes: 0,
    stats: null,          // speed, distance and jumps this run (see trackStats)
    airSteps: 0,          // how long the bike has been in the air
    airUpright: 0,        // flip tracking (see trackFlips)
    airMin: 0,
    airMax: 0,
    airBack: 0,           // flips already counted on this jump
    airFront: 0,
    airStartX: 0,
    best: null,           // your best run on this level: { timeMs, splits, ghost } (the ghost)
    bestMs: null,         // best time shown on screen (updates at the finish line)
    tunedRun: false,      // tuning-panel sliders were changed at some point during this run
    recording: [],        // this run, recorded for the ghost
    result: null,         // filled in at the finish line
    split: null,          // last checkpoint/finish comparison with your best
    zone: null,           // physics zone the bike is in right now
    physics: null,        // the physics values in use right now
    popups: [],
    steps: 0,
    paused: false
  };

  var STEP_MS = CONFIG.physicsStepSec * 1000;
  var input = { gas: false, brake: false, leanBack: false, leanForward: false };
  var HOLD = { brake: true, holdStill: true }; // rider holds the brakes (start line, after the finish)
  var camera = { x: 0, y: 0, look: 0 };

  function anyInput() { return input.gas || input.brake || input.leanBack || input.leanForward; }

  // Your time = the clock minus the flip bonus
  function raceTimeMs() { return Math.max(0, state.timeMs - state.flipBonusMs); }

  // ---------------------------------------------------
  // BEST TIMES: saved in this browser (localStorage), one per level. If the
  // browser blocks saving, best times last until the page is closed.
  // ---------------------------------------------------
  var Records = (function () {
    var PREFIX = "graveRider.best.v1.", memory = {};
    function validFrame(f) { return Array.isArray(f) && f.length === 13; }
    function valid(run) {
      var g = run && run.ghost;
      return !!(run && typeof run.timeMs === "number" && Array.isArray(run.splits) && g &&
        typeof g.every === "number" && g.every > 0 && Array.isArray(g.frames) && g.frames.length > 0 &&
        validFrame(g.frames[0]) && validFrame(g.frames[g.frames.length - 1]));
    }
    function load(level) {
      if (memory[level.name]) return memory[level.name];
      try {
        var run = JSON.parse(localStorage.getItem(PREFIX + level.name));
        if (valid(run)) return (memory[level.name] = run);
      } catch (e) { /* no saved time, or saving is blocked */ }
      return null;
    }
    function save(level, run) {
      memory[level.name] = run;
      try { localStorage.setItem(PREFIX + level.name, JSON.stringify(run)); return true; }
      catch (e) { return false; }
    }
    function clear() {
      memory = {};
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k); });
      } catch (e) { /* saving is blocked: nothing stored */ }
    }
    return { load: load, save: save, clear: clear };
  })();

  // ---------------------------------------------------
  // GHOST: your best run, replayed as a see-through bike next to you.
  // Every 2nd physics step the position of each part is recorded;
  // playback blends between recorded frames.
  // ---------------------------------------------------
  var GHOST_EVERY = 2;

  function round3(x) { return Math.round(x * 1000) / 1000; }

  // One frame: chassis, rear wheel, front wheel, rider as x, y, angle; then crashed (1/0)
  function ghostFrame(bike) {
    var P = Bike.poseOf(bike), out = [];
    [P.chassis, P.rear, P.front, P.rider].forEach(function (p) { out.push(round3(p.x), round3(p.y), round3(p.a)); });
    out.push(P.crashed ? 1 : 0);
    return out;
  }

  // Where the best run's bike was at this moment of the clock (null = no best yet)
  function ghostPose(timeMs) {
    var g = state.best && state.best.ghost;
    if (!g || !g.frames.length) return null;
    var frames = g.frames, last = frames.length - 1;
    var f = timeMs / (g.every * STEP_MS), i = Math.floor(f), t = f - i;
    if (i >= last) { i = last; t = 0; } // the ghost waits at the end of its run
    var A = frames[i], B = frames[Math.min(i + 1, last)];
    // Don't blend across a crash respawn (the bike jumps back to the checkpoint)
    if (A[12] !== B[12] || Math.abs(B[0] - A[0]) > 3 || Math.abs(B[1] - A[1]) > 3) t = 0;
    function part(k) {
      return { x: A[k] + (B[k] - A[k]) * t, y: A[k + 1] + (B[k + 1] - A[k + 1]) * t, a: A[k + 2] + (B[k + 2] - A[k + 2]) * t };
    }
    return { chassis: part(0), rear: part(3), front: part(6), rider: part(9), crashed: A[12] === 1 };
  }

  // ---------------------------------------------------
  // LEVEL LOADING
  // ---------------------------------------------------
  // Level data is in pixels; physics is in metres
  function buildTerrain(level) {
    var ground = world.createBody({ type: "static", userData: "ground" });
    level.terrain.forEach(function (piece) {
      // A piece is either a list of points, or { points, solidAbove }
      // (solidAbove = the ground is ABOVE the line, for ceilings; only
      // changes how it is drawn - the physics surface is the line itself)
      var pts = (piece.points || piece).map(function (p) { return Vec2(p.x / PPM, p.y / PPM); });
      ground.createFixture({ shape: planck.Chain(pts, false), friction: 1, restitution: 0 });
    });
  }

  function loadLevel(index) {
    // Remove everything from the old level
    for (var b = world.getBodyList(); b; ) { var next = b.getNext(); world.destroyBody(b); b = next; }
    state.bike = null;

    var level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    buildTerrain(level);

    state.mode = "ready";
    state.timeMs = 0;
    state.runSteps = 0;
    state.flipBonusMs = 0;
    state.backflips = 0;
    state.frontflips = 0;
    state.crashes = 0;
    state.checkpoint = level.start;
    state.checkpointIndex = -1;
    state.splits = [];
    state.stats = { topSpeed: 0, distance: 0, airMs: 0, longestJump: 0, longestJumpAirMs: 0 };
    state.best = Records.load(level);
    state.bestMs = state.best ? state.best.timeMs : null;
    state.tunedRun = false;
    state.recording = [];
    state.result = null;
    state.split = null;
    state.popups = [];
    spawnBike(level.start);
  }

  // at = { x, y } in level pixels
  function spawnBike(at) {
    if (state.bike) Bike.remove(world, state.bike);
    state.bike = Bike.create(world, at.x / PPM, at.y / PPM);
    state.airSteps = 0;
    state.airUpright = 0; // a new bike starts upright
    state.airMin = 0;
    state.airMax = 0;
    state.airBack = 0;
    state.airFront = 0;
    state.crashTimerMs = 0;
    updatePhysics();
    camera.x = at.x;
    camera.y = at.y;
    camera.look = 0;
  }

  // Bike position and speed in level pixels
  function bikePos() {
    var p = state.bike.chassis.getPosition();
    return { x: p.x * PPM, y: p.y * PPM };
  }
  function bikeVel() {
    var v = state.bike.chassis.getLinearVelocity();
    return { x: v.x * PPM, y: v.y * PPM };
  }

  // ---------------------------------------------------
  // PHYSICS SETTINGS: level values, overridden by zones
  // ---------------------------------------------------
  var PHYSICS_DEFAULTS = { gravityScale: 1, gravityDir: { x: 0, y: 1 }, bounce: 0, friction: 1 };

  function findZone(level, pos) {
    var zones = level.zones || [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (pos.x >= z.x && pos.x <= z.x + z.w && pos.y >= z.y && pos.y <= z.y + z.h) return z;
    }
    return null;
  }

  function updatePhysics() {
    var level = state.level, bike = state.bike;
    var zone = findZone(level, bikePos());
    var p = Object.assign({}, PHYSICS_DEFAULTS, level.physics || {}, zone ? zone.physics : {});
    state.zone = zone;
    state.physics = p;

    var len = Math.hypot(p.gravityDir.x, p.gravityDir.y) || 1;
    state.gravity = 9.81 * CONFIG.gravity * p.gravityScale; // m/s²
    world.setGravity(Vec2(p.gravityDir.x / len * state.gravity, p.gravityDir.y / len * state.gravity));
    Bike.applyTuning(bike, p.friction, p.bounce);
  }

  // ---------------------------------------------------
  // ONE FIXED PHYSICS STEP
  // ---------------------------------------------------
  function step() {
    var dt = STEP_MS;
    var bike = state.bike;
    state.steps++;

    // The clock starts the moment you press any control
    if (state.mode === "ready" && anyInput()) {
      state.mode = "playing";
      state.recording = [ghostFrame(bike)];
    }

    updatePhysics();
    Bike.suspension(bike);
    Bike.resistance(bike, state.gravity);
    if (state.mode === "playing") Bike.control(bike, input);
    else if (state.mode !== "crashed") Bike.control(bike, HOLD);
    world.step(CONFIG.physicsStepSec, 20, 10);
    Bike.updateContacts(bike);

    // The clock runs while playing and while waiting to respawn after a crash
    if (state.mode === "playing" || state.mode === "crashed") {
      state.runSteps++;
      state.timeMs = state.runSteps * STEP_MS; // counted in whole steps (no rounding drift)
      if (!state.tunedRun && Tuning.isTuned()) state.tunedRun = true;
      if (state.runSteps % GHOST_EVERY === 0) state.recording.push(ghostFrame(bike));
    }

    if (state.mode === "playing") {
      // Crash is checked first: crashing on the same step as the finish = crash
      if (bike.riderHit || isFallen()) crash();
      else {
        trackFlips();
        trackStats();
        checkProgress();
      }
    } else if (state.mode === "crashed") {
      state.crashTimerMs += dt;
      if (state.crashTimerMs >= CONFIG.crashRestartDelayMs) {
        state.mode = "playing";
        spawnBike(state.checkpoint);
      }
    }

    updateCamera();

    // Fade out popups
    state.popups.forEach(function (p) { p.age += dt; });
    state.popups = state.popups.filter(function (p) { return p.age < 1600; });
    if (state.split) state.split.age += dt;
  }

  function isFallen() {
    var y = bikePos().y, level = state.level;
    if (level.fallLimitY !== undefined && y > level.fallLimitY) return true;
    if (level.fallLimitTopY !== undefined && y < level.fallLimitTopY) return true;
    return false;
  }

  function crash() {
    state.mode = "crashed";
    state.crashTimerMs = 0;
    state.crashes++;
    Bike.letGo(state.bike); // the rider falls off the bike
    popup("CRASH!", "#ff4d4d");
  }

  // ---------------------------------------------------
  // FLIPS: while in the air, remember how far the bike has turned each
  // way, measured from "upright". The moment it has turned all the way
  // round (within flipSlack), that flip counts and takes time off.
  // A flip you are still in the middle of when you crash gives nothing.
  // ---------------------------------------------------
  var TURN = Math.PI * 2;

  function trackFlips() {
    var bike = state.bike;
    var angle = bike.chassis.getAngle();

    if (Bike.touching(bike)) {
      if (state.airSteps > 8) landed(); // a real jump, not a bump
      state.airSteps = 0;
      return;
    }
    if (state.airSteps === 0) {
      state.airStartX = bike.chassis.getPosition().x;
      // Just took off: "upright" is the nearest whole turn to the current angle.
      // If the bike is far from upright (a wheel brushed something mid-flip),
      // keep counting the flip that was already going.
      var near = Math.round(angle / TURN) * TURN;
      if (Math.abs(angle - near) < Math.PI / 2) {
        state.airUpright = near;
        state.airMin = angle;
        state.airMax = angle;
        state.airBack = 0;
        state.airFront = 0;
      }
    }
    state.airSteps++;
    state.airMin = Math.min(state.airMin, angle);
    state.airMax = Math.max(state.airMax, angle);

    // Leaning back turns the bike anticlockwise (negative angle) = backflip
    var back = Math.floor((state.airUpright - state.airMin + CONFIG.flipSlack) / TURN);
    var front = Math.floor((state.airMax - state.airUpright + CONFIG.flipSlack) / TURN);
    while (state.airBack < back) { state.airBack++; state.backflips++; awardFlip("BACKFLIP", state.airBack); }
    while (state.airFront < front) { state.airFront++; state.frontflips++; awardFlip("FRONTFLIP", state.airFront); }
  }

  function awardFlip(kind, nth) {
    state.flipBonusMs += CONFIG.flipTimeBonus * 1000;
    var name = nth === 2 ? "DOUBLE " : nth === 3 ? "TRIPLE " : nth > 3 ? nth + "x " : "";
    popup(name + kind + "!  -" + CONFIG.flipTimeBonus + " s", "#ffd23f");
  }

  // Landed a jump: remember the longest one (its distance and its air time)
  function landed() {
    var s = state.stats, dist = Math.abs(state.bike.chassis.getPosition().x - state.airStartX);
    if (dist > s.longestJump) { s.longestJump = dist; s.longestJumpAirMs = state.airSteps * STEP_MS; }
  }

  // Ride stats for the finish screen
  function trackStats() {
    var v = state.bike.chassis.getLinearVelocity(), speed = Math.hypot(v.x, v.y), s = state.stats;
    s.topSpeed = Math.max(s.topSpeed, speed);
    s.distance += speed * CONFIG.physicsStepSec;
    if (!Bike.touching(state.bike)) s.airMs += STEP_MS;
  }

  function popup(text, color) {
    state.popups.push({ text: text, color: color, age: 0 });
  }

  // ---------------------------------------------------
  // CHECKPOINTS AND FINISH (compared with your best run)
  // ---------------------------------------------------
  function checkProgress() {
    var level = state.level, x = bikePos().x;
    for (var i = state.checkpointIndex + 1; i < level.checkpoints.length; i++) {
      if (x >= level.checkpoints[i].x) {
        state.checkpointIndex = i;
        state.checkpoint = level.checkpoints[i];
        state.splits[i] = raceTimeMs();
        var bestSplit = state.best ? state.best.splits[i] : null;
        state.split = { label: "CHECKPOINT " + (i + 1), timeMs: state.splits[i],
          deltaMs: typeof bestSplit === "number" ? state.splits[i] - bestSplit : null, age: 0 };
        popup("CHECKPOINT", "#7dff9a");
      }
    }
    if (x >= level.finish.x) finish();
  }

  function finish() {
    state.mode = "finished";
    var time = raceTimeMs(), best = state.best;
    var newBest = !best || time < best.timeMs;
    // Runs where tuning-panel settings were changed don't replace your best time
    var tuned = state.tunedRun || Tuning.isTuned();
    var saved = false;
    if (newBest && !tuned) {
      saved = Records.save(state.level, { timeMs: time, splits: state.splits.slice(),
        ghost: { every: GHOST_EVERY, frames: state.recording } });
      state.bestMs = time; // kept for this visit even if the browser blocks saving
    }
    state.result = { timeMs: time, clockMs: state.timeMs, previousBestMs: best ? best.timeMs : null,
      deltaMs: best ? time - best.timeMs : null, newBest: newBest, tuned: tuned, saved: saved };
    state.split = { label: "FINISH", timeMs: time, deltaMs: state.result.deltaMs, age: 0 };
  }

  // ---------------------------------------------------
  // INPUT
  // ---------------------------------------------------
  var KEYS = {
    ArrowUp: "gas", KeyW: "gas",
    ArrowDown: "brake", KeyS: "brake",
    ArrowLeft: "leanBack", KeyA: "leanBack",
    ArrowRight: "leanForward", KeyD: "leanForward"
  };

  window.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "TEXTAREA") return;
    if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
    if (e.code === "KeyR" && !e.repeat) loadLevel(state.levelIndex);
    if (e.code === "KeyT" && !e.repeat) Tuning.toggle();
  });
  window.addEventListener("keyup", function (e) {
    if (KEYS[e.code]) { input[KEYS[e.code]] = false; e.preventDefault(); }
  });
  // Don't keep driving if the window loses focus
  window.addEventListener("blur", function () {
    for (var k in input) input[k] = false;
  });

  // ---------------------------------------------------
  // CAMERA (moved once per physics step, so it follows the same way on
  // 60 Hz and 144 Hz screens)
  // ---------------------------------------------------
  function updateCamera() {
    var p = bikePos(), vel = bikeVel();
    var targetLook = Math.max(-CONFIG.cameraMaxLookAhead,
      Math.min(CONFIG.cameraMaxLookAhead, vel.x * CONFIG.cameraLookAhead));
    camera.look += (targetLook - camera.look) * 0.03;
    var s = CONFIG.cameraSmoothing;
    camera.x += (p.x + camera.look - camera.x) * s;
    camera.y += (p.y - camera.y) * s;
  }

  // ---------------------------------------------------
  // DRAWING
  // ---------------------------------------------------
  // Ground texture (a picture that repeats)
  var dirtImg = new Image(), dirtFill = null;
  dirtImg.src = ART.dirt;
  function dirtPattern() {
    if (!dirtFill && dirtImg.complete && dirtImg.naturalWidth > 0) dirtFill = ctx.createPattern(dirtImg, "repeat");
    return dirtFill;
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function worldScale() { return viewH / 560; }

  function drawBackground() {
    // Daytime sky
    var g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "#5f9fd8");
    g.addColorStop(0.65, "#a9d0ee");
    g.addColorStop(1, "#dcecf7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    // Sun
    ctx.fillStyle = "rgba(255, 250, 220, 0.35)";
    ctx.beginPath(); ctx.arc(viewW * 0.8, viewH * 0.16, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffbe6";
    ctx.beginPath(); ctx.arc(viewW * 0.8, viewH * 0.16, 38, 0, Math.PI * 2); ctx.fill();

    // Distant hills, two layers (move slower than the ground = depth)
    [[0.15, "#9db8c9", 0.52, 60], [0.3, "#7f9f86", 0.62, 40]].forEach(function (layer) {
      ctx.fillStyle = layer[1];
      ctx.beginPath();
      ctx.moveTo(0, viewH);
      for (var x = 0; x <= viewW + 20; x += 20) {
        var wx = x + camera.x * layer[0];
        ctx.lineTo(x, viewH * layer[2] - layer[3] * Math.sin(wx * 0.004) - layer[3] * 0.6 * Math.sin(wx * 0.011));
      }
      ctx.lineTo(viewW, viewH);
      ctx.fill();
    });
  }

  function drawWorld() {
    var level = state.level, s = worldScale();
    ctx.save();
    ctx.translate(viewW * 0.42, viewH * 0.58);
    ctx.scale(s, s);
    ctx.translate(-camera.x, -camera.y);

    // Physics zones
    (level.zones || []).forEach(function (z) {
      ctx.fillStyle = z.color || "rgba(255,255,255,0.08)";
      ctx.fillRect(z.x, z.y, z.w, z.h);
      if (z.label) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(z.label, z.x + z.w / 2, z.y + 240);
      }
    });

    // Ground
    level.terrain.forEach(function (piece) {
      var pts = piece.points || piece;
      var edge = piece.solidAbove ? -5000 : 5000;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, edge);
      pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(pts[pts.length - 1].x, edge);
      ctx.closePath();
      ctx.fillStyle = level.groundColor;
      ctx.fill();
      var dirt = dirtPattern();
      if (dirt) { ctx.fillStyle = dirt; ctx.fill(); }
      // Packed, darker dirt along the riding surface, with a lighter top edge
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = "rgba(60, 40, 25, 0.45)";
      ctx.lineWidth = 22;
      ctx.stroke();
      ctx.strokeStyle = level.groundTopColor;
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    // Checkpoint flags
    level.checkpoints.forEach(function (cp, i) {
      var reached = i <= state.checkpointIndex;
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cp.x, cp.y + 40); ctx.lineTo(cp.x, cp.y - 90); ctx.stroke();
      ctx.fillStyle = reached ? "#7dff9a" : "#ff8a1f";
      ctx.beginPath(); ctx.moveTo(cp.x, cp.y - 90); ctx.lineTo(cp.x + 44, cp.y - 76); ctx.lineTo(cp.x, cp.y - 62); ctx.fill();
    });

    // Finish line: two posts with a checkered banner
    var fx = level.finish.x, fy = groundYAt(level, fx);
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx - 4, fy - 200); ctx.stroke();
    for (var i = 0; i < 12; i++) {
      for (var j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#fff" : "#111";
        ctx.fillRect(fx + j * 15, fy - 200 + i * 15, 15, 15);
      }
    }

    // Ghost of your best run (see-through), then your bike, in metres
    var ghost = ghostPose(state.timeMs);
    if (ghost) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BEST", ghost.chassis.x * PPM, ghost.chassis.y * PPM - 110);
    }
    ctx.save();
    ctx.scale(PPM, PPM);
    if (ghost) {
      ctx.globalAlpha = 0.4;
      Bike.drawPose(ctx, ghost);
      ctx.globalAlpha = 1;
    }
    Bike.draw(ctx, state.bike);
    ctx.restore();
    ctx.restore();
  }

  // Height of the ground at x (top-most surface), used to place the finish flag
  function groundYAt(level, x) {
    var best = 0;
    level.terrain.forEach(function (piece) {
      var pts = piece.points || piece;
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        if (x >= a.x && x <= b.x && b.x !== a.x) best = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
      }
    });
    return best;
  }

  function formatTime(ms) {
    ms = Math.round(ms * 1000) / 1000; // 13749.9999999 ms is 13.75 s, not 13.74
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100;
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  }

  // +0.42 (slower than your best) or -0.31 (faster)
  function formatDelta(ms) {
    return (ms < 0 ? "-" : "+") + (Math.abs(ms) / 1000).toFixed(2);
  }

  // Speed and distance in the units chosen in config.js
  function speedText(mps) {
    return CONFIG.speedUnit === "km/h" ? Math.round(mps * 3.6) + " km/h" : Math.round(mps * 2.23694) + " mph";
  }
  function distanceText(m) {
    return CONFIG.speedUnit === "km/h" ? Math.round(m) + " m" : Math.round(m * 3.28084) + " ft";
  }

  function drawHUD() {
    // Timer, best time, flips
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(12, 12, 250, 104);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px monospace";
    ctx.fillText(formatTime(raceTimeMs()), 24, 48);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#d8deea";
    ctx.fillText("BEST   " + (state.bestMs === null ? "-:--.--" : formatTime(state.bestMs)), 24, 74);
    var flips = state.backflips + state.frontflips;
    ctx.fillText("FLIPS  " + flips + (flips ? "  (-" + (state.flipBonusMs / 1000).toFixed(1) + " s)" : ""), 24, 98);

    // Checkpoint / finish split compared with your best run
    var sp = state.split;
    if (sp && (sp.age < 3000 || state.mode === "finished")) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(12, 122, 250, 58);
      ctx.fillStyle = "#d8deea";
      ctx.font = "14px monospace";
      ctx.fillText(sp.label, 24, 142);
      ctx.font = "bold 24px monospace";
      if (sp.deltaMs === null) { ctx.fillStyle = "#fff"; ctx.fillText(formatTime(sp.timeMs), 24, 170); }
      else {
        ctx.fillStyle = sp.deltaMs <= 0 ? "#7dff9a" : "#ff6b6b";
        ctx.fillText(formatDelta(sp.deltaMs), 24, 170);
      }
    }

    // Speedometer
    var v = state.bike.chassis.getLinearVelocity(), unit = speedText(Math.hypot(v.x, v.y)).split(" ");
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(viewW - 172, viewH - 82, 160, 70);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 44px monospace";
    ctx.fillText(unit[0], viewW - 72, viewH - 30);
    ctx.font = "16px monospace";
    ctx.fillText(unit[1], viewW - 22, viewH - 30);

    if (state.zone && state.zone.label) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#9fdcff";
      ctx.font = "bold 18px monospace";
      ctx.fillText(state.zone.label, viewW - 20, 36);
    }

    // Popups (flips, checkpoints, crashes) float up and fade
    ctx.textAlign = "center";
    state.popups.forEach(function (p, i) {
      var t = p.age / 1600;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.font = "bold 34px sans-serif";
      ctx.fillText(p.text, viewW / 2, viewH * 0.3 - t * 40 + i * 40);
    });
    ctx.globalAlpha = 1;

    if (state.mode === "ready") {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("Press any control to start", viewW / 2, viewH * 0.3);
    }
    if (state.mode === "ready" || (state.timeMs < 6000 && state.mode === "playing")) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "15px monospace";
      ctx.fillText("UP/W gas   DOWN/S brake + reverse   LEFT/A lean back   RIGHT/D lean forward   R restart   T tuning", viewW / 2, viewH - 24);
    }

    if (state.mode === "finished") drawFinish();
  }

  // Finish screen: your time against your best, and stats of the ride
  function drawFinish() {
    var r = state.result, s = state.stats;
    var w = Math.min(480, viewW - 24), h = 430;
    var x = (viewW - w) / 2, y = Math.max(12, (viewH - h) / 2 - 20);
    ctx.fillStyle = "rgba(5, 3, 20, 0.85)";
    ctx.fillRect(x, y, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8a1f";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("FINISH!", viewW / 2, y + 54);

    var verdict, color;
    if (r.previousBestMs === null) { verdict = "FIRST TIME SET"; color = "#7dff9a"; }
    else if (r.newBest) { verdict = "NEW BEST!  " + formatDelta(r.deltaMs); color = "#7dff9a"; }
    else { verdict = formatDelta(r.deltaMs) + " slower than your best"; color = "#ff6b6b"; }
    ctx.fillStyle = color;
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(verdict, viewW / 2, y + 88);

    var clockS = r.clockMs / 1000;
    var rows = [
      ["Your time", formatTime(r.timeMs)],
      ["Previous best", r.previousBestMs === null ? "-" : formatTime(r.previousBestMs)],
      ["Clock", formatTime(r.clockMs)],
      ["Flip bonus", "-" + (state.flipBonusMs / 1000).toFixed(1) + " s  (" + state.backflips + " back, " + state.frontflips + " front)"],
      ["Top speed", speedText(s.topSpeed)],
      ["Average speed", speedText(clockS > 0 ? s.distance / clockS : 0)],
      ["Air time", (s.airMs / 1000).toFixed(1) + " s"],
      ["Longest jump", distanceText(s.longestJump) + "  (" + (s.longestJumpAirMs / 1000).toFixed(1) + " s)"],
      ["Crashes", String(state.crashes)]
    ];
    ctx.font = "18px monospace";
    rows.forEach(function (row, i) {
      var ry = y + 128 + i * 28;
      ctx.textAlign = "left"; ctx.fillStyle = "#b9c0cf";
      ctx.fillText(row[0], x + 28, ry);
      ctx.textAlign = "right"; ctx.fillStyle = "#fff";
      ctx.fillText(row[1], x + w - 28, ry);
    });

    ctx.textAlign = "center";
    var note = r.newBest && r.tuned ? "Tuning panel settings were changed, so this time was not saved as your best"
      : r.newBest && !r.saved ? "Your browser blocked saving: this best time lasts until you close the page" : "";
    if (note) {
      ctx.fillStyle = "#ffd23f";
      ctx.font = "14px sans-serif";
      ctx.fillText(note, viewW / 2, y + h - 52);
    }
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Press R to ride again", viewW / 2, y + h - 20);
  }

  // ---------------------------------------------------
  // MAIN LOOP (fixed physics step, draw every frame)
  // ---------------------------------------------------
  var lastTime = 0, accumulator = 0;
  function frame(now) {
    if (!lastTime) lastTime = now;
    // Cap the gap so a frozen tab doesn't fast-forward the game
    accumulator += Math.min(now - lastTime, 250);
    lastTime = now;
    var steps = 0;
    if (state.paused) accumulator = 0; // tests can pause and step by hand
    while (accumulator >= STEP_MS && steps < 10) {
      step();
      accumulator -= STEP_MS;
      steps++;
    }
    drawBackground();
    drawWorld();
    drawHUD();
    requestAnimationFrame(frame);
  }

  resize();
  Bike.loadArt();
  loadLevel(0);
  requestAnimationFrame(frame);

  // Exposed so the tuning panel and automated tests can read the game
  return { state: state, input: input, world: world, step: step, bikePos: bikePos, bikeVel: bikeVel,
    loadLevel: loadLevel, spawnBike: spawnBike, camera: camera, raceTimeMs: raceTimeMs, ghostPose: ghostPose,
    clearBest: function () { Records.clear(); state.best = null; state.bestMs = null; } };
})();

// =====================================================
// TUNING PANEL (press T) — sliders that change CONFIG live
// =====================================================
var Tuning = (function () {
  // Slider list: which CONFIG value, its name, and its range
  var SLIDERS = [
    { key: "gravity", label: "Gravity (1 = Earth)", min: 0.2, max: 2.5, step: 0.05 },
    { key: "motorPower", label: "Motor power (W)", min: 10000, max: 60000, step: 1000 },
    { key: "flipAssist", label: "Flip assist in the air (N·m, 0 = real life)", min: 0, max: 3000, step: 50 },
    { key: "throttleControl", label: "Rider throttle help (0 = real life)", min: 0, max: 1, step: 0.05 },
    { key: "suspensionStiffness", label: "Spring stiffness (1 = stock)", min: 0.5, max: 2, step: 0.05 },
    { key: "wheelGrip", label: "Wheel grip", min: 0.2, max: 2, step: 0.05 }
  ];

  var panel = document.getElementById("tuning");
  var rows = document.getElementById("tuning-rows");
  var out = document.getElementById("tuning-text");
  var status = document.getElementById("tuning-status");
  var inputs = {};

  function decimals(step) { return (String(step).split(".")[1] || "").length; }

  SLIDERS.forEach(function (sl) {
    var row = document.createElement("label");
    row.className = "row";
    var name = document.createElement("span");
    name.textContent = sl.label;
    var value = document.createElement("b");
    var range = document.createElement("input");
    range.type = "range";
    range.min = sl.min; range.max = sl.max; range.step = sl.step;
    range.value = CONFIG[sl.key];
    function show() { value.textContent = Number(CONFIG[sl.key]).toFixed(decimals(sl.step)); }
    range.addEventListener("input", function () { CONFIG[sl.key] = parseFloat(range.value); show(); });
    // Give the arrow keys back to the game after using a slider
    range.addEventListener("change", function () { range.blur(); });
    range.addEventListener("pointerup", function () { range.blur(); });
    show();
    row.appendChild(name); row.appendChild(value); row.appendChild(range);
    rows.appendChild(row);
    inputs[sl.key] = { range: range, show: show };
  });

  function settingsText() {
    var lines = SLIDERS.map(function (sl) { return "  " + sl.key + ": " + CONFIG[sl.key] + ","; });
    return "Grave Rider settings:\n{\n" + lines.join("\n").replace(/,$/, "") + "\n}";
  }

  document.getElementById("tuning-copy").addEventListener("click", function (e) {
    var text = settingsText();
    out.value = text;
    out.style.display = "block";
    function fallback() {
      out.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      status.textContent = ok ? "Copied!" : "Select the text below and press Ctrl+C";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status.textContent = "Copied!"; }, fallback);
    } else {
      fallback();
    }
    e.target.blur();
  });

  document.getElementById("tuning-reset").addEventListener("click", function (e) {
    SLIDERS.forEach(function (sl) {
      CONFIG[sl.key] = CONFIG_DEFAULTS[sl.key];
      inputs[sl.key].range.value = CONFIG[sl.key];
      inputs[sl.key].show();
    });
    status.textContent = "Reset to defaults";
    e.target.blur();
  });

  document.getElementById("tuning-clear").addEventListener("click", function (e) {
    Game.clearBest();
    status.textContent = "Best times cleared";
    e.target.blur();
  });

  return {
    toggle: function () { panel.classList.toggle("open"); },
    settingsText: settingsText,
    // true if any slider is not at its default (then a new best time isn't saved)
    isTuned: function () {
      return SLIDERS.some(function (sl) { return CONFIG[sl.key] !== CONFIG_DEFAULTS[sl.key]; });
    }
  };
})();
