// =====================================================
// GRAVE RIDER — AUTOMATED TESTS (for Claude, not needed to play)
// Run from the GraveRider folder:  node tests/run-tests.js
// Needs Playwright installed. Screenshots go to tests/screenshots/
// =====================================================
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  (" + detail + ")" : ""));
}

// Test helpers, added to the page (window.T)
function installHelpers() {
  const G = Game, s = G.state;
  const none = { gas: false, brake: false, leanBack: false, leanForward: false };
  window.T = {
    none,
    flatLevel() {
      LEVELS.push({ name: "Flat test", physics: {}, groundColor: "#6b4f3a", groundTopColor: "#a07e5e",
        start: { x: 0, y: -40 }, checkpoints: [], finish: { x: 100000 }, fallLimitY: 900,
        terrain: [[{ x: -600, y: 0 }, { x: 20000, y: 0 }]], zones: [] });
      return LEVELS.length - 1;
    },
    // Rides like a real rider: leans forward and rolls off / taps the rear
    // brake when the front comes up, off the throttle in the air, slows
    // down before the jumps and the big hill, and lands level.
    autopilot() {
      for (let i = 0; i < 60 * 120 && s.mode !== "finished"; i++) {
        const b = s.bike, raw = b.chassis.getAngle(), ground = b.rearOnGround || b.frontOnGround;
        const a = Math.atan2(Math.sin(raw), Math.cos(raw)); // tilt between -PI and PI
        const w = b.chassis.getAngularVelocity();
        const px = G.bikePos().x, kmh = Math.hypot(G.bikeVel().x, G.bikeVel().y) / CONFIG.pixelsPerMetre * 3.6;
        const inp = { gas: true, brake: false, leanBack: false, leanForward: false };
        if (ground) {
          const e = a - b.groundAngle + 0.25 * w; // nose-up compared with the slope = negative
          if (e < -0.12) inp.leanForward = true;
          if (e < -0.30) inp.gas = false;
          if (e < -0.50 && !b.frontOnGround) inp.brake = true;
          if (e > 0.4) inp.leanBack = true;
        } else {
          inp.gas = false; // off the throttle in the air
          const e = a + 0.6 * w; // aim to land level
          if (e < -0.1) inp.leanForward = true;
          if (e > 0.1) inp.leanBack = true;
        }
        if (px > 1900 && px < 3150 && kmh > 40) { inp.gas = false; inp.brake = kmh > 50; }
        if (px > 4450 && px < 5560 && kmh > 35) { inp.gas = false; inp.brake = kmh > 45; }
        Object.assign(G.input, inp);
        G.step();
      }
      Object.assign(G.input, none);
    },
    // A freestyle-style ramp: 2.2 m tall with a ~43° lip, a 3.4 m tall
    // landing ramp 15 m away and a long landing. Reach takeoffKmh, then
    // backflip: lean back with the throttle open until one full turn, then
    // level out for the landing. (The test track's double is too short for
    // a flip: the speed a flip needs overshoots its landing onto the flat.)
    rampBackflip(takeoffKmh) {
      const S = Shapes;
      LEVELS.push({ name: "Ramp test", physics: {}, groundColor: "#6b4f3a", groundTopColor: "#a07e5e",
        start: { x: 0, y: -40 }, checkpoints: [], finish: { x: 6900 }, fallLimitY: 900, zones: [],
        terrain: [S.join(S.line(-600, 0, 3000, 0), S.kicker(3000, 0, 3300, -140, 14),
          [{ x: 3304, y: -140 }, { x: 3310, y: 0 }], S.line(3310, 0, 4240, 0),
          [{ x: 4300, y: -220 }, { x: 4340, y: -220 }], S.curve(4340, -220, 5440, 0, 24), S.line(5440, 0, 9500, 0))] });
      G.loadLevel(LEVELS.length - 1);
      let flipping = false, done = false, target = 0, flipInAir = false;
      for (let i = 0; i < 60 * 30 && s.mode !== "finished" && s.mode !== "crashed"; i++) {
        const b = s.bike, raw = b.chassis.getAngle(), w = b.chassis.getAngularVelocity(), ground = b.rearOnGround || b.frontOnGround;
        const a = Math.atan2(Math.sin(raw), Math.cos(raw)), px = G.bikePos().x;
        const kmh = Math.hypot(G.bikeVel().x, G.bikeVel().y) / CONFIG.pixelsPerMetre * 3.6;
        const inp = { gas: false, brake: false, leanBack: false, leanForward: false };
        if (ground) {
          const e = a - b.groundAngle + 0.25 * w;
          inp.leanForward = true; // lean first, then throttle
          inp.gas = i > 36 && e > -0.30 && kmh < takeoffKmh;
          if (e < -0.5 && !b.frontOnGround) inp.brake = true;
          if (flipping) { flipping = false; done = true; }
        } else if (!done && (flipping || (px > 3250 && px < 3700))) {
          if (!flipping) { flipping = true; target = Math.round(raw / (2 * Math.PI)) * 2 * Math.PI - 2 * Math.PI; }
          const e = raw + 0.6 * w - target;
          if (e > 0.1) { inp.leanBack = true; inp.gas = true; } // throttle in the air lifts the nose too
          if (e < -0.1) inp.leanForward = true;
        } else {
          const e = a + 0.6 * w;
          if (e < -0.1) inp.leanForward = true;
          if (e > 0.1) inp.leanBack = true;
        }
        const before = s.backflips;
        Object.assign(G.input, inp);
        G.step();
        if (s.backflips > before) flipInAir = !(s.bike.rearOnGround || s.bike.frontOnGround);
      }
      Object.assign(G.input, none);
      const r = { mode: s.mode, backflips: s.backflips, bonus: s.flipBonusMs, timeMs: s.timeMs, race: G.raceTimeMs(), flipInAir, crashes: s.crashes };
      LEVELS.pop();
      return r;
    },
    // Spawn high up, turn the bike by `turns` (negative = backflip), then
    // nose-dive into the ground. Returns flips counted before the crash.
    flipThenCrash(turns) {
      G.loadLevel(0);
      G.spawnBike({ x: 300, y: -3000 });
      Object.assign(G.input, none, { leanBack: true }); G.step(); // start the clock
      const start = s.bike.chassis.getAngle(), goal = start + turns * 2 * Math.PI;
      for (let i = 0; i < 900 && s.mode === "playing"; i++) {
        const raw = s.bike.chassis.getAngle(), w = s.bike.chassis.getAngularVelocity();
        const reached = turns < 0 ? raw <= goal : raw >= goal;
        // after the goal, keep the nose pointing straight down to crash on the head
        const aim = reached ? goal + Math.PI / 2 * Math.sign(turns || 1) : goal;
        const e = raw + 0.4 * w - aim;
        Object.assign(G.input, none, e > 0.1 ? { leanBack: true } : e < -0.1 ? { leanForward: true } : {});
        G.step();
      }
      Object.assign(G.input, none);
      return { mode: s.mode, back: s.backflips, front: s.frontflips, bonus: s.flipBonusMs };
    }
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.waitForTimeout(1000);
  await page.evaluate(installHelpers);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const bike = () => page.evaluate(() => {
    const s = Game.state, c = s.bike.chassis, p = Game.bikePos();
    return { x: p.x, y: p.y, angle: c.getAngle(), spin: c.getAngularVelocity(), mode: s.mode, crashes: s.crashes,
      timeMs: s.timeMs, backflips: s.backflips, frontflips: s.frontflips, checkpointIndex: s.checkpointIndex };
  });

  // 1. Page loads, waiting at the start line
  check("Page loads with no console errors", errors.length === 0, errors.join(" | "));
  await page.waitForTimeout(500);
  const idle = await bike();
  check("Clock waits at 0 until a control is pressed", idle.mode === "ready" && idle.timeMs === 0, "mode " + idle.mode + ", time " + idle.timeMs);
  await shot("01-start");

  // 2. Real keyboard: gas + lean forward with full rider throttle help, on flat ground
  await page.evaluate(() => { CONFIG.throttleControl = 1; Game.loadLevel(T.flatLevel()); });
  await page.waitForTimeout(300);
  const before = await bike();
  let worstTilt = 0;
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(100);
  const started = await bike();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const b = await bike();
    worstTilt = Math.max(worstTilt, Math.abs(b.angle));
    if (i === 6) await shot("02-gas");
  }
  await page.keyboard.up("ArrowUp");
  const after = await bike();
  await page.evaluate(() => { CONFIG.throttleControl = CONFIG_DEFAULTS.throttleControl; LEVELS.pop(); Game.loadLevel(0); });
  check("Pressing gas starts the clock", started.mode === "playing" && started.timeMs > 0, "time " + Math.round(started.timeMs) + " ms");
  check("Gas for 5s moves the bike forward", after.x - before.x > 1000, "moved " + Math.round(after.x - before.x) + "px");
  check("With rider throttle help on, full throttle stays upright", worstTilt < 1.2 && after.crashes === 0,
    "max tilt " + worstTilt.toFixed(2) + " rad, crashes " + after.crashes);

  // 3. Real life (help off): full throttle with neutral lean loops out; leaning forward keeps the front down
  const wheelie = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const lvl = T.flatLevel();
    function trial(inp) {
      Object.assign(G.input, T.none); G.loadLevel(lvl);
      for (let i = 0; i < 60; i++) G.step();
      // shift your weight first (takes a real rider about 0.35 s), then open the throttle
      if (inp.leanForward) { Object.assign(G.input, T.none, { leanForward: true }); for (let i = 0; i < 36; i++) G.step(); }
      Object.assign(G.input, T.none, inp);
      let maxPitch = 0;
      for (let i = 0; i < 300 && (s.mode === "playing" || i === 0); i++) {
        G.step(); maxPitch = Math.max(maxPitch, -s.bike.chassis.getAngle());
      }
      const r = { crashed: s.crashes > 0, maxPitchDeg: Math.round(maxPitch * 57.3), kmh: Math.round(Math.hypot(G.bikeVel().x, G.bikeVel().y) / 64 * 3.6) };
      Object.assign(G.input, T.none);
      return r;
    }
    const out = { neutral: trial({ gas: true }), forward: trial({ gas: true, leanForward: true }) };
    LEVELS.pop(); G.loadLevel(0); s.paused = false;
    return out;
  });
  check("Real life: full throttle, neutral lean loops out", wheelie.neutral.crashed && wheelie.neutral.maxPitchDeg > 90,
    "max wheelie " + wheelie.neutral.maxPitchDeg + "°");
  check("Real life: lean forward first, then full throttle keeps the front down", !wheelie.forward.crashed && wheelie.forward.maxPitchDeg < 60,
    "max wheelie " + wheelie.forward.maxPitchDeg + "°, " + wheelie.forward.kmh + " km/h after 5 s");

  // 4. Lean in the air rotates the bike (flip assist); flip assist does nothing on the ground
  await page.keyboard.press("KeyR");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -1500 }));
  const a0 = (await bike()).angle;
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(600);
  await shot("03-air-lean");
  await page.keyboard.up("ArrowLeft");
  const a1 = (await bike()).angle;
  check("Leaning back in the air rotates the bike backwards", a1 - a0 < -0.25, "rotated " + (a1 - a0).toFixed(2) + " rad");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -1500 }));
  const f0 = (await bike()).angle;
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowRight");
  const f1 = (await bike()).angle;
  check("Leaning forward in the air rotates the bike forwards", f1 - f0 > 0.25, "rotated " + (f1 - f0).toFixed(2) + " rad");
  const groundAssist = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    function lean(assist) {
      CONFIG.flipAssist = assist; G.loadLevel(0); for (let i = 0; i < 60; i++) G.step();
      Object.assign(G.input, T.none, { leanBack: true }); for (let i = 0; i < 60; i++) G.step();
      Object.assign(G.input, T.none); return s.bike.chassis.getAngle();
    }
    const d = lean(3000) - lean(0);
    CONFIG.flipAssist = CONFIG_DEFAULTS.flipAssist; G.loadLevel(0); s.paused = false;
    return d;
  });
  check("Flip assist only works in the air (wheelies stay real)", Math.abs(groundAssist) < 1e-6, "difference " + groundAssist.toExponential(1));

  // 5. Headfirst into the ground = crash, then auto restart (clock keeps running)
  await page.keyboard.press("KeyR");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -900 }));
  let crashed = false, held = "";
  for (let i = 0; i < 200 && !crashed; i++) {
    const b = await bike();
    crashed = b.mode === "crashed";
    const e = b.angle + 0.35 * b.spin; // where the bike will be in a moment
    const want = e < Math.PI - 0.25 ? "ArrowRight" : e > Math.PI + 0.25 ? "ArrowLeft" : "";
    if (want !== held) {
      if (held) await page.keyboard.up(held);
      if (want) await page.keyboard.down(want);
      held = want;
    }
    await page.waitForTimeout(15);
  }
  if (held) await page.keyboard.up(held);
  const atCrash = await bike();
  await shot("04-crash");
  check("Landing on the head is detected as a crash", crashed);
  await page.waitForTimeout(1300);
  const re = await bike();
  check("After a crash the bike restarts at the last checkpoint", re.mode === "playing" && Math.abs(re.x - 0) < 60,
    "mode " + re.mode + ", x " + Math.round(re.x));
  check("The clock keeps running while you respawn", re.timeMs - atCrash.timeMs > 1000,
    "clock went " + (atCrash.timeMs / 1000).toFixed(2) + " -> " + (re.timeMs / 1000).toFixed(2) + " s");

  // 6. Flips: each full turn counts in the air the moment it is done; half a flip then a crash gives nothing
  const flips = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const half = T.flipThenCrash(-0.6), full = T.flipThenCrash(-1.15), front = T.flipThenCrash(1.15);
    G.loadLevel(0); s.paused = false;
    return { half, full, front };
  });
  check("A flip you crash in the middle of gives nothing", flips.half.mode === "crashed" && flips.half.back === 0 && flips.half.bonus === 0,
    "mode " + flips.half.mode + ", backflips " + flips.half.back);
  check("A finished backflip counts (even if you crash afterwards) and takes 0.5 s off", flips.full.mode === "crashed" && flips.full.back === 1 && flips.full.bonus === 500,
    "mode " + flips.full.mode + ", backflips " + flips.full.back + ", bonus " + flips.full.bonus + " ms");
  check("Frontflips are counted separately", flips.front.front === 1 && flips.front.back === 0,
    "frontflips " + flips.front.front + ", backflips " + flips.front.back);

  // 7. Backflip off a freestyle ramp: counts mid-air and takes time off your time
  const flip = await page.evaluate(() => {
    const s = Game.state; s.paused = true;
    const r = T.rampBackflip(60);
    Game.loadLevel(0); s.paused = false;
    return r;
  });
  check("Backflip off a freestyle ramp (about 32 mph take-off, default flip assist)", flip.backflips === 1 && flip.crashes === 0 && flip.mode === "finished",
    "backflips " + flip.backflips + ", crashes " + flip.crashes + ", " + flip.mode);
  check("The flip counts mid-air and takes 0.5 s off your time", flip.flipInAir && flip.bonus === 500 && Math.abs(flip.race - (flip.timeMs - 500)) < 1e-6,
    "counted in the air: " + flip.flipInAir + ", time " + (flip.race / 1000).toFixed(2) + " s = clock " + (flip.timeMs / 1000).toFixed(2) + " - 0.5");

  // 8. Autopilot ride on the test track: checkpoint, the finish, zones
  await page.keyboard.press("KeyR");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} Game.clearBest(); });
  const run = await page.evaluate(() => {
    const G = Game, s = G.state;
    s.paused = true;
    G.loadLevel(0);
    T.autopilot();
    const finishedAt = s.timeMs, xAtFinish = G.bikePos().x;
    // after the finish: the rider brakes to a stop and the clock is frozen
    let minX = Infinity;
    for (let i = 0; i < 400; i++) { G.step(); if (i > 200) minX = Math.min(minX, G.bikePos().x); }
    const endX = G.bikePos().x, endSpeed = Math.hypot(G.bikeVel().x, G.bikeVel().y) / CONFIG.pixelsPerMetre;
    // Physics zones: add a test zone around the bike and check gravity changes
    LEVELS[0].zones.push({ x: -1e6, y: -1e6, w: 2e6, h: 2e6, physics: { gravityScale: 0.35 } });
    G.step();
    const zoneGravity = s.gravity;
    LEVELS[0].zones.pop();
    G.step();
    s.paused = false;
    return { mode: s.mode, zoneGravity, cp: s.checkpointIndex,
      crashes: s.crashes, timeMs: s.timeMs, finishedAt, race: G.raceTimeMs(), result: s.result,
      endSpeed, minX, endX, xAtFinish, stats: s.stats, splits: s.splits.slice() };
  });
  check("Checkpoint is reached", run.cp === 0);
  check("Physics zones change gravity", Math.abs(run.zoneGravity - 9.81 * 0.35) < 0.01, "gravity in zone " + run.zoneGravity.toFixed(2) + " m/s²");
  check("Finish line ends the level", run.mode === "finished",
    "time " + (run.race / 1000).toFixed(2) + " s, crashes " + run.crashes);
  check("Clock stops at the finish", run.timeMs === run.finishedAt);
  check("After the finish the bike stops (no driving on, no reversing)", run.endSpeed < 0.3 && run.endX >= run.minX - 1,
    "speed " + run.endSpeed.toFixed(2) + " m/s, rolled " + ((run.endX - run.xAtFinish) / 64).toFixed(1) + " m after the line");
  check("First finish is saved as the best time", run.result && run.result.newBest && run.result.saved,
    JSON.stringify(run.result));
  check("Ride stats are recorded", run.stats.topSpeed > 10 && run.stats.distance > 140 && run.stats.longestJump > 5 && run.stats.airMs > 500,
    "top " + (run.stats.topSpeed * 3.6).toFixed(0) + " km/h, distance " + run.stats.distance.toFixed(0) + " m, longest jump " +
    run.stats.longestJump.toFixed(1) + " m, air " + (run.stats.airMs / 1000).toFixed(1) + " s");
  await page.waitForTimeout(200);
  await shot("05-finish");

  // 9. Ghost + comparison: race again. The ghost follows the best run; splits compare with it.
  const ghost = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    G.loadLevel(0);
    const hasBest = !!s.best, g0 = G.ghostPose(0), g2 = G.ghostPose(2000);
    T.autopilot(); // the same ride again

    const r = { hasBest, ghostStart: g0 && g0.chassis.x, ghostAt2s: g2 && g2.chassis.x, split: s.result && s.split,
      result: s.result, splitDelta: null };
    s.paused = false;
    return r;
  });
  check("Best run's ghost is ready on the next attempt", ghost.hasBest && ghost.ghostStart !== null && ghost.ghostAt2s > ghost.ghostStart + 5,
    "ghost x at 0 s " + (ghost.ghostStart || 0).toFixed(1) + " m, at 2 s " + (ghost.ghostAt2s || 0).toFixed(1) + " m");
  check("Finish compares with your best (equal time is not a new best)", ghost.result && ghost.result.deltaMs === 0 &&
    !ghost.result.newBest && ghost.result.previousBestMs !== null,
    "difference " + (ghost.result ? (ghost.result.deltaMs / 1000).toFixed(2) : "?") + " s, new best: " + (ghost.result && ghost.result.newBest));
  // live ghost on screen next to the bike (screenshot), and a checkpoint split
  await page.keyboard.press("KeyR");
  await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    T.autopilot(); // a full ride (the best run stays the same or improves)
    s.paused = false;
  });
  await page.keyboard.press("KeyR");
  await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    // ride the first 2.5 s like the best run but with less throttle: the ghost pulls ahead
    for (let i = 0; i < 150; i++) {
      const b = s.bike, a = b.chassis.getAngle(), w = b.chassis.getAngularVelocity();
      Object.assign(G.input, T.none, { gas: i % 3 !== 0 && a + 0.25 * w > -0.25, leanForward: a + 0.25 * w < -0.12 });
      G.step();
    }
    Object.assign(G.input, T.none);
  });
  await page.waitForTimeout(200);
  await shot("06-ghost");
  const live = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    // jump to just before the checkpoint and cross it
    G.spawnBike({ x: s.level.checkpoints[0].x - 40, y: -40 });
    Object.assign(G.input, { gas: true, leanForward: true });
    for (let i = 0; i < 30 && s.checkpointIndex < 0; i++) G.step();
    Object.assign(G.input, T.none);
    s.paused = false;
    return { split: s.split };
  });
  check("Checkpoint shows the difference to your best", live.split && typeof live.split.deltaMs === "number",
    "split " + JSON.stringify(live.split));
  await page.waitForTimeout(300);
  await shot("07-split");

  // 10. Crash and finish on the same step = crash; a crash after the finish doesn't undo it
  const order = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const realUpdate = Bike.updateContacts;
    G.loadLevel(0);
    Object.assign(G.input, { gas: true }); G.step(); Object.assign(G.input, T.none);
    G.spawnBike({ x: s.level.finish.x + 50, y: -40 }); // past the line
    Bike.updateContacts = function (b) { realUpdate(b); b.riderHit = true; }; // rider hits the ground this step
    G.step();
    const sameStep = s.mode;
    Bike.updateContacts = realUpdate;
    G.loadLevel(0);
    Object.assign(G.input, { gas: true }); G.step(); Object.assign(G.input, T.none);
    G.spawnBike({ x: s.level.finish.x + 50, y: -40 });
    G.step();
    const finished = s.mode;
    Bike.updateContacts = function (b) { realUpdate(b); b.riderHit = true; };
    for (let i = 0; i < 5; i++) G.step();
    Bike.updateContacts = realUpdate;
    const afterCrash = s.mode;
    G.loadLevel(0); s.paused = false;
    return { sameStep, finished, afterCrash };
  });
  check("Crash on the same step as the finish counts as a crash", order.sameStep === "crashed", "mode " + order.sameStep);
  check("Crash right after the finish still counts as finished", order.finished === "finished" && order.afterCrash === "finished",
    order.finished + " -> " + order.afterCrash);

  // 11. Brake, reverse, reverse up a slope, checkpoint respawn
  const extra = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const none = T.none;
    // Brake: get up to speed, then hold brake
    G.loadLevel(T.flatLevel());
    Object.assign(G.input, none, { gas: true, leanForward: true });
    for (let i = 0; i < 40; i++) G.step();
    const fast = Game.bikeVel().x / CONFIG.pixelsPerMetre;
    Object.assign(G.input, none, { brake: true });
    for (let i = 0; i < 40; i++) G.step();
    const braked = Game.bikeVel().x / CONFIG.pixelsPerMetre;
    // Reverse: keep holding brake once stopped
    for (let i = 0; i < 120; i++) G.step();
    const reversing = Game.bikeVel().x / CONFIG.pixelsPerMetre;
    LEVELS.pop();
    // Reverse up a 12° slope: bike facing downhill, hold brake. (On much steeper
    // slopes the rear tyre spins: facing downhill most weight is on the front.)
    const t = Math.tan(12 * Math.PI / 180), PPM = CONFIG.pixelsPerMetre;
    LEVELS.push({ name: "Slope test", physics: {}, groundColor: "#000", groundTopColor: "#000",
      start: { x: 20 * PPM, y: (20 * t - 0.95) * PPM }, checkpoints: [], finish: { x: 1e9 }, fallLimitY: 1e9,
      terrain: [[{ x: -100 * PPM, y: -100 * t * PPM }, { x: 100 * PPM, y: 100 * t * PPM }]], zones: [] });
    G.loadLevel(LEVELS.length - 1);
    // tilt the bike to sit on the slope (nose down)
    const b = s.bike, c = b.chassis.getPosition(), ang = Math.atan(t);
    [b.chassis, b.rider, b.rear.wheel, b.front.wheel].forEach(body => {
      const p = body.getPosition(), dx = p.x - c.x, dy = p.y - c.y;
      body.setTransform(planck.Vec2(c.x + dx * Math.cos(ang) - dy * Math.sin(ang), c.y + dx * Math.sin(ang) + dy * Math.cos(ang)), body.getAngle() + ang);
    });
    for (let i = 0; i < 30; i++) G.step();
    const y0 = Game.bikePos().y;
    Object.assign(G.input, none, { brake: true });
    for (let i = 0; i < 240; i++) G.step();
    const climbed = (y0 - Game.bikePos().y) / PPM;
    Object.assign(G.input, none);
    LEVELS.pop();
    // Checkpoint respawn: pass the checkpoint, then crash
    G.loadLevel(0);
    Object.assign(G.input, none, { gas: true }); G.step(); Object.assign(G.input, none);
    const cp = s.level.checkpoints[0];
    G.spawnBike({ x: cp.x + 100, y: cp.y });
    G.step();
    const reachedCp = s.checkpointIndex;
    G.spawnBike({ x: cp.x + 300, y: cp.y - 300 });
    for (let i = 0; i < 300 && s.mode === "playing"; i++) {
      const e = s.bike.chassis.getAngle() + 0.35 * s.bike.chassis.getAngularVelocity();
      Object.assign(G.input, none, e < Math.PI - 0.2 ? { leanForward: true } : e > Math.PI + 0.2 ? { leanBack: true } : {});
      G.step();
    }
    const crashedAfterCp = s.mode === "crashed";
    Object.assign(G.input, none);
    for (let i = 0; i < 70; i++) G.step();
    const respawnX = Game.bikePos().x;
    s.paused = false;
    return { fast, braked, reversing, climbed, reachedCp, crashedAfterCp, respawnX, cpX: cp.x, mode: s.mode };
  });
  check("Brake slows the bike down", extra.braked < extra.fast * 0.5,
    "speed " + extra.fast.toFixed(1) + " -> " + extra.braked.toFixed(1) + " m/s");
  check("Holding brake when stopped drives backwards", extra.reversing < -2, "speed " + extra.reversing.toFixed(1) + " m/s");
  check("Holding brake facing downhill backs up a 12° slope", extra.climbed > 1, "climbed " + extra.climbed.toFixed(1) + " m in 4 s");
  check("Crash after the checkpoint respawns at the checkpoint",
    extra.reachedCp === 0 && extra.crashedAfterCp && Math.abs(extra.respawnX - extra.cpX) < 60 && extra.mode === "playing",
    "respawned at x " + Math.round(extra.respawnX) + " (checkpoint " + extra.cpX + ")");

  // 12. Review fixes: fast finish and hard braking stay upright, tuned-then-reset runs,
  //     damaged save files, frame-on-the-ground counts as ground
  const fixes = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const kmh = () => Math.hypot(G.bikeVel().x, G.bikeVel().y) / CONFIG.pixelsPerMetre * 3.6;
    const tilt = () => { const a = s.bike.chassis.getAngle(); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); };
    function straight(finishX) {
      LEVELS.push({ name: "Straight test", physics: {}, groundColor: "#6b4f3a", groundTopColor: "#a07e5e",
        start: { x: 0, y: -40 }, checkpoints: [], finish: { x: finishX }, fallLimitY: 900, zones: [],
        terrain: [[{ x: -600, y: 0 }, { x: 40000, y: 0 }]] });
      Object.assign(G.input, T.none);
      G.loadLevel(LEVELS.length - 1);
      Object.assign(G.input, T.none, { leanForward: true });
      for (let i = 0; i < 36; i++) G.step(); // lean first
    }
    function speedUp(target, stopX) {
      for (let i = 0; i < 60 * 20 && kmh() < target && G.bikePos().x < stopX && s.mode === "playing"; i++) {
        const a = s.bike.chassis.getAngle(), w = s.bike.chassis.getAngularVelocity();
        Object.assign(G.input, T.none, { leanForward: true, gas: a + 0.25 * w > -0.3 });
        G.step();
      }
    }
    const out = {};
    // a) cross the finish flat out (about 120 km/h)
    straight(14000);
    speedUp(200, 14000);
    for (let i = 0; i < 60 * 10 && s.mode === "playing"; i++) { Object.assign(G.input, T.none, { gas: true, leanForward: true }); G.step(); }
    out.finishKmh = kmh(); out.finishMode = s.mode;
    let worst = 0;
    for (let i = 0; i < 600; i++) { G.step(); worst = Math.max(worst, tilt()); }
    out.finishWorstTilt = worst; out.finishEndKmh = kmh();
    LEVELS.pop();
    // b) hold the brake at 110 km/h
    straight(1e9);
    speedUp(110, 1e9);
    out.brakeFrom = kmh();
    worst = 0;
    for (let i = 0; i < 300 && s.mode === "playing"; i++) { Object.assign(G.input, T.none, { brake: true }); G.step(); worst = Math.max(worst, tilt()); }
    out.brakeMode = s.mode; out.brakeWorstTilt = worst;
    Object.assign(G.input, T.none);
    LEVELS.pop();
    // c) change a slider during the run, put it back, then finish
    G.clearBest(); G.loadLevel(0);
    Object.assign(G.input, { gas: true }); G.step(); Object.assign(G.input, T.none);
    CONFIG.gravity = 0.5; G.step(); G.step();
    CONFIG.gravity = CONFIG_DEFAULTS.gravity;
    G.spawnBike({ x: s.level.finish.x + 50, y: -40 }); G.step();
    out.tunedResult = s.result; out.tunedBest = s.bestMs;
    // d) a damaged save file (no splits) is ignored instead of freezing the game
    try { localStorage.setItem("graveRider.best.v1.Test Track", JSON.stringify({ timeMs: 30000, ghost: { every: 2, frames: [[0,0,0,0,0,0,0,0,0,0,0,0,0]] } })); } catch (e) {}
    G.loadLevel(0);
    out.damagedBest = s.best;
    Object.assign(G.input, { gas: true });
    let threw = "";
    try { G.spawnBike({ x: s.level.checkpoints[0].x - 30, y: -40 }); for (let i = 0; i < 30; i++) G.step(); } catch (e) { threw = e.message; }
    out.damagedThrew = threw;
    Object.assign(G.input, T.none);
    try { localStorage.removeItem("graveRider.best.v1.Test Track"); } catch (e) {}
    // e) frame touching the ground (wheels in the air) = on the ground: no air time, no flip assist
    const realUpdate = Bike.updateContacts;
    function belly(assist) {
      CONFIG.flipAssist = assist; G.loadLevel(0);
      for (let i = 0; i < 30; i++) G.step();
      Bike.updateContacts = function (b) { realUpdate(b); b.rearAir = b.frontAir = 99; b.rearOnGround = b.frontOnGround = false; b.bodyOnGround = true; };
      Object.assign(G.input, T.none, { leanBack: true });
      for (let i = 0; i < 60; i++) G.step();
      Bike.updateContacts = realUpdate;
      Object.assign(G.input, T.none);
      return { angle: s.bike.chassis.getAngle(), airMs: s.stats.airMs };
    }
    const b1 = belly(3000), b0 = belly(0);
    CONFIG.flipAssist = CONFIG_DEFAULTS.flipAssist;
    out.bellyAssistDiff = b1.angle - b0.angle; out.bellyAirMs = b1.airMs;
    G.loadLevel(0); s.paused = false;
    return out;
  });
  check("Crossing the finish flat out: the bike brakes to a stop upright", fixes.finishMode === "finished" && fixes.finishKmh > 100 &&
    fixes.finishWorstTilt < 0.6 && fixes.finishEndKmh < 1,
    Math.round(fixes.finishKmh) + " km/h at the line, worst tilt " + (fixes.finishWorstTilt * 57.3).toFixed(0) + "°");
  check("Holding the brake at 110 km/h doesn't throw the rider over the bars", fixes.brakeMode === "playing" && fixes.brakeWorstTilt < 0.8,
    "from " + Math.round(fixes.brakeFrom) + " km/h, worst tilt " + (fixes.brakeWorstTilt * 57.3).toFixed(0) + "°, " + fixes.brakeMode);
  check("Changing a slider mid-run, then putting it back, still doesn't save the run", fixes.tunedResult && fixes.tunedResult.tuned &&
    !fixes.tunedResult.saved && fixes.tunedBest === null, JSON.stringify(fixes.tunedResult));
  check("A damaged save file is ignored (the game keeps running)", fixes.damagedBest === null && fixes.damagedThrew === "", fixes.damagedThrew);
  check("Bike frame touching the ground counts as on the ground (no air time, no flip assist)",
    Math.abs(fixes.bellyAssistDiff) < 1e-6 && fixes.bellyAirMs === 0, "assist difference " + fixes.bellyAssistDiff.toExponential(1) + ", air " + fixes.bellyAirMs + " ms");

  // 13. Hard landings: a 2 m drop to flat is rideable, 5 m throws the rider off
  const drops = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    const lvl = T.flatLevel();
    function drop(h) {
      Object.assign(G.input, T.none); G.loadLevel(lvl);
      G.spawnBike({ x: 0, y: -(h + 0.66) * CONFIG.pixelsPerMetre });
      Object.assign(G.input, { brake: true }); G.step(); Object.assign(G.input, T.none); // start the clock
      let maxG = 0, maxCrouch = 0;
      for (let i = 0; i < 240 && s.mode === "playing"; i++) { G.step(); maxG = Math.max(maxG, s.bike.riderG); maxCrouch = Math.max(maxCrouch, s.bike.crouch); }
      return { mode: s.mode, maxG, maxCrouch };
    }
    const out = { d2: drop(2), d5: drop(5) };
    LEVELS.pop(); G.loadLevel(0); s.paused = false;
    return out;
  });
  check("The rider's legs soak up a 2 m drop to flat (no crash)", drops.d2.mode === "playing" && drops.d2.maxCrouch > 0.05,
    "legs bent " + Math.round(drops.d2.maxCrouch * 1000) + " mm, " + drops.d2.maxG.toFixed(1) + " g");
  check("Landing a 5 m drop to flat is too hard: the rider is thrown off", drops.d5.mode === "crashed",
    drops.d5.mode + ", " + drops.d5.maxG.toFixed(1) + " g");

  // 14. R restarts the level
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(200);
  const r = await bike();
  check("R restarts the level (waiting for a control again)", r.mode === "ready" && r.timeMs === 0 && Math.abs(r.x) < 60 && r.backflips === 0);

  // 15. Tuning panel: T opens it, sliders change values, copy works, tuned runs aren't saved, clear works
  await page.keyboard.press("KeyT");
  const open = await page.isVisible("#tuning");
  await page.locator("#tuning input[type=range]").first().fill("1.5");
  const grav = await page.evaluate(() => CONFIG.gravity);
  await page.click("#tuning-copy");
  await page.waitForTimeout(200);
  const copied = await page.inputValue("#tuning-text");
  await shot("08-tuning");
  check("T opens the tuning panel", open);
  check("Gravity slider changes the setting", grav === 1.5, "gravity " + grav);
  check("Copy settings produces the values as text", copied.includes("gravity: 1.5") && copied.includes("throttleControl"));
  const tuned = await page.evaluate(() => {
    const G = Game, s = G.state; s.paused = true;
    G.clearBest();
    G.loadLevel(0);
    Object.assign(G.input, { gas: true }); G.step(); Object.assign(G.input, T.none);
    G.spawnBike({ x: s.level.finish.x - 20, y: -40 });
    Object.assign(G.input, { gas: true });
    for (let i = 0; i < 60 && s.mode !== "finished"; i++) G.step();
    Object.assign(G.input, T.none);
    const res = s.result;
    G.loadLevel(0);
    s.paused = false;
    return { res, bestAfter: s.best };
  });
  check("A run with changed tuning settings is not saved as best", tuned.res && tuned.res.newBest && tuned.res.tuned && !tuned.res.saved && tuned.bestAfter === null,
    JSON.stringify(tuned.res));
  await page.click("#tuning-reset");
  await page.click("#tuning-clear");
  const cleared = await page.evaluate(() => { Game.loadLevel(0); return Game.state.best === null; });
  check("Clear best times removes the best time and ghost", cleared);
  await page.keyboard.press("KeyT");
  check("T closes the tuning panel", !(await page.isVisible("#tuning")));
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowUp");
  check("Keys drive the bike after using the panel buttons", (await bike()).mode === "playing");

  check("No console errors during all tests", errors.length === 0, errors.join(" | "));
  await browser.close();

  const failed = results.filter((x) => !x.ok).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " tests passed");
  process.exit(failed ? 1 : 0);
})();
