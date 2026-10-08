// =====================================================
// GRAVE RIDER — GAME LOOP, CAMERA, INPUT, HUD
// =====================================================
var Game = (function () {
  var Vec2 = planck.Vec2;
  var PPM = CONFIG.pixelsPerMetre; // pixels per metre

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var viewW = 0, viewH = 0;

  var world = planck.World({ gravity: Vec2(0, 9.81) });

  // Everything about the current run lives in "state"
  var state = {
    levelIndex: 0,
    level: null,
    bike: null,
    mode: "playing",      // playing | crashed | finished
    timeMs: 0,
    score: 0,
    backflips: 0,
    frontflips: 0,
    checkpoint: null,     // where you respawn after a crash
    checkpointIndex: -1,
    crashTimerMs: 0,
    crashes: 0,
    airSteps: 0,          // how long the bike has been in the air
    airUpright: 0,        // flip tracking (see trackFlips)
    airMin: 0,
    airMax: 0,
    pendingFlip: null,    // flip waiting to be confirmed (no crash right after landing)
    zone: null,           // physics zone the bike is in right now
    physics: null,        // the physics values in use right now
    popups: [],
    steps: 0,
    paused: false
  };

  var STEP_MS = CONFIG.physicsStepSec * 1000;
  var input = { gas: false, brake: false, leanBack: false, leanForward: false };
  var camera = { x: 0, y: 0, look: 0 };

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

    state.mode = "playing";
    state.timeMs = 0;
    state.score = 0;
    state.backflips = 0;
    state.frontflips = 0;
    state.crashes = 0;
    state.checkpoint = level.start;
    state.checkpointIndex = -1;
    state.popups = [];
    spawnBike(level.start);
  }

  // at = { x, y } in level pixels
  function spawnBike(at) {
    if (state.bike) Bike.remove(world, state.bike);
    state.bike = Bike.create(world, at.x / PPM, at.y / PPM);
    state.airSteps = 0;
    state.pendingFlip = null;
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

    updatePhysics();
    Bike.suspension(bike);
    Bike.resistance(bike, state.gravity);
    if (state.mode === "playing") Bike.control(bike, input);
    world.step(CONFIG.physicsStepSec, 20, 10);
    Bike.updateContacts(bike);

    if (state.mode === "playing") {
      state.timeMs += dt;
      trackFlips();
      checkProgress();
      if (bike.riderHit || isFallen()) crash();
    } else if (state.mode === "crashed") {
      state.crashTimerMs += dt;
      if (state.crashTimerMs >= CONFIG.crashRestartDelayMs) {
        state.mode = "playing";
        spawnBike(state.checkpoint);
      }
    }

    // Fade out popups
    state.popups.forEach(function (p) { p.age += dt; });
    state.popups = state.popups.filter(function (p) { return p.age < 1600; });
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
    state.pendingFlip = null; // a crash cancels a flip you just landed
    Bike.letGo(state.bike); // the rider falls off the bike
    popup("CRASH!", "#ff4d4d");
  }

  // ---------------------------------------------------
  // FLIPS: while in the air, remember how far the bike has turned
  // each way, measured from "upright". Each time it gets all the way
  // around past upright again, that's one flip.
  // ---------------------------------------------------
  var TURN = Math.PI * 2;

  function trackFlips() {
    var bike = state.bike;
    var angle = bike.chassis.getAngle();

    // A landed flip only counts if you don't crash in the next moment
    if (state.pendingFlip) {
      state.pendingFlip.wait -= 1;
      if (state.pendingFlip.wait <= 0) {
        awardFlip(state.pendingFlip);
        state.pendingFlip = null;
      }
    }

    if (!Bike.onGround(bike)) {
      if (state.airSteps === 0) {
        // Just took off: "upright" is the nearest whole turn to the current angle
        state.airUpright = Math.round(angle / TURN) * TURN;
        state.airMin = angle;
        state.airMax = angle;
      }
      state.airSteps++;
      state.airMin = Math.min(state.airMin, angle);
      state.airMax = Math.max(state.airMax, angle);
      return;
    }

    // Just landed after a real jump?
    if (state.airSteps > 8) {
      // Leaning back turns the bike anticlockwise (negative angle) = backflip
      var back = Math.floor((state.airUpright - state.airMin + CONFIG.flipLandingSlack) / TURN);
      var front = Math.floor((state.airMax - state.airUpright + CONFIG.flipLandingSlack) / TURN);
      if (back > 0 || front > 0) state.pendingFlip = { back: back, front: front, wait: 12 };
    }
    state.airSteps = 0;
  }

  function awardFlip(f) {
    [["BACKFLIP", f.back], ["FRONTFLIP", f.front]].forEach(function (kind) {
      var turns = kind[1];
      if (turns <= 0) return;
      var points = turns * turns * CONFIG.flipPoints; // doubles & triples are worth more
      state.score += points;
      if (kind[0] === "BACKFLIP") state.backflips += turns; else state.frontflips += turns;
      popup("FLIP! " + (turns > 1 ? turns + "x " : "") + kind[0] + " +" + points, "#ffd23f");
    });
  }

  function popup(text, color) {
    state.popups.push({ text: text, color: color, age: 0 });
  }

  // ---------------------------------------------------
  // CHECKPOINTS AND FINISH
  // ---------------------------------------------------
  function checkProgress() {
    var level = state.level, x = bikePos().x;
    for (var i = state.checkpointIndex + 1; i < level.checkpoints.length; i++) {
      if (x >= level.checkpoints[i].x) {
        state.checkpointIndex = i;
        state.checkpoint = level.checkpoints[i];
        popup("CHECKPOINT", "#7dff9a");
      }
    }
    if (x >= level.finish.x) finish();
  }

  function finish() {
    if (state.pendingFlip) { awardFlip(state.pendingFlip); state.pendingFlip = null; }
    state.mode = "finished";
    // Time bonus: faster = more points (never below zero)
    state.timeBonus = Math.max(0, Math.round(10000 - state.timeMs / 10));
    state.score += state.timeBonus;
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
  // CAMERA
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

    // The bike is drawn in metres
    ctx.save();
    ctx.scale(PPM, PPM);
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
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100;
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  }

  function drawHUD() {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(12, 12, 230, 100);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px monospace";
    ctx.fillText(formatTime(state.timeMs), 24, 46);
    ctx.font = "16px monospace";
    ctx.fillText("SCORE  " + state.score, 24, 72);
    ctx.fillText("FLIPS  back " + state.backflips + " / front " + state.frontflips, 24, 96);

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

    if (state.timeMs < 6000 && state.mode === "playing") {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "15px monospace";
      ctx.fillText("UP/W gas   DOWN/S brake   LEFT/A lean back   RIGHT/D lean forward   R restart   T tuning", viewW / 2, viewH - 24);
    }

    if (state.mode === "finished") drawFinish();
  }

  function drawFinish() {
    ctx.fillStyle = "rgba(5, 3, 20, 0.8)";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8a1f";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("FINISH!", viewW / 2, viewH / 2 - 110);
    ctx.fillStyle = "#fff";
    ctx.font = "24px monospace";
    var lines = [
      "Time        " + formatTime(state.timeMs),
      "Backflips   " + state.backflips,
      "Frontflips  " + state.frontflips,
      "Time bonus  " + state.timeBonus,
      "SCORE       " + state.score
    ];
    lines.forEach(function (l, i) { ctx.fillText(l, viewW / 2, viewH / 2 - 50 + i * 34); });
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("Press R to replay", viewW / 2, viewH / 2 + 150);
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
    updateCamera();
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
  return { state: state, input: input, world: world, step: step, bikePos: bikePos, bikeVel: bikeVel, loadLevel: loadLevel, spawnBike: spawnBike, camera: camera };
})();

// =====================================================
// TUNING PANEL (press T) — sliders that change CONFIG live
// =====================================================
var Tuning = (function () {
  // Slider list: which CONFIG value, its name, and its range
  var SLIDERS = [
    { key: "gravity", label: "Gravity (1 = Earth)", min: 0.2, max: 2.5, step: 0.05 },
    { key: "motorPower", label: "Motor power (W)", min: 10000, max: 60000, step: 1000 },
    { key: "flipAssist", label: "Flip assist (N·m, 0 = real life)", min: 0, max: 3000, step: 50 },
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

  return {
    toggle: function () { panel.classList.toggle("open"); },
    settingsText: settingsText
  };
})();
