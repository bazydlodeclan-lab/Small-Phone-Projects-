// Rides every level in js/levels.js with a test rider (leans forward before
// throttle, keeps the front down, levels out for the landing, optional backflips)
// and checks the level rules. Run from the GraveRider folder:
//   node tests/ride-levels.js            (all levels, speeds 0.9 / 1.0 / 1.1)
//   node tests/ride-levels.js 1          (just level 1)
// Rules: every ride finishes with 0 crashes, never stuck, a hold-the-throttle rider crashes or is slower,
// at least 50 m of run-out after the finish.
//
// testRide in each level: [{ x, kmh, flip }] - from each x onward the rider aims for
// that speed (km/h); flip: true means "do a backflip on the next jump after this x".
const path = require("path");
const { chromium } = require("playwright");

const GAME = path.join(__dirname, "..", "index.html");
const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
const scales = [0.9, 1, 1.1];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + GAME);
  await page.waitForTimeout(400);
  const count = await page.evaluate(() => LEVELS.length);
  let failed = 0;
  for (let index = 0; index < count; index++) {
  if (only !== null && index !== only) continue;
  const report = await page.evaluate(([scales, index]) => {
    const G = Game, s = G.state, PPM = CONFIG.pixelsPerMetre;
    s.paused = true;
    const L = LEVELS[index], idx = index;
    const none = { gas: false, brake: false, leanBack: false, leanForward: false };

    // ---- static checks ----
    function groundY(x) { // top-most ground surface at x (null = hole)
      let best = null;
      L.terrain.forEach(piece => {
        if (piece.solidAbove) return; // beams and ceilings are not ground
        const pts = piece.points || piece;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          if (x >= a.x && x <= b.x && b.x !== a.x) {
            const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
            if (best === null || y < best) best = y;
          }
        }
      });
      return best;
    }
    function slopeDeg(x) {
      const a = groundY(x - 16), b = groundY(x + 16);
      if (a === null || b === null) return null;
      return Math.atan2(b - a, 32) * 180 / Math.PI; // + = downhill to the right
    }
    const checks = {};
    let flatAfter = 0;
    for (let x = L.finish.x; x < L.finish.x + 6000; x += 16) {
      const sd = slopeDeg(x);
      if (sd === null || Math.abs(sd) > 3) break;
      flatAfter = x - L.finish.x;
    }
    checks.runOutM = +(flatAfter / PPM).toFixed(1);
    checks.lengthM = +((L.finish.x - L.start.x) / PPM).toFixed(0);
    checks.checkpoints = L.checkpoints.length;
    let steepest = 0, steepAt = 0;
    for (let x = L.start.x; x < L.finish.x; x += 8) {
      const sd = slopeDeg(x);
      if (sd !== null && Math.abs(sd) > steepest && Math.abs(sd) < 80) { steepest = Math.abs(sd); steepAt = x; }
    }
    checks.steepestRideableDeg = +steepest.toFixed(0);
    checks.steepestAt = steepAt;

    // ---- bot ride ----
    const plan = (L.testRide || [{ x: -1e9, kmh: 40 }]).slice().sort((a, b) => a.x - b.x);
    function targetAt(x, scale) { let k = plan[0].kmh * scale; plan.forEach(p => { if (p.x <= x) k = p.kmh * (p.fixed ? 1 : scale); }); return k; }
    function flipFrom(x) { let f = null; plan.forEach(p => { if (p.flip && p.x <= x && x < p.x + 900) f = p.x; }); return f; }

    function ride(scale, hold) {
      Object.assign(G.input, none);
      G.clearBest();
      G.loadLevel(idx);
      let flipping = false, flipTarget = 0, flipsDone = {}, maxG = 0, worstLandingTilt = 0;
      let lastProgressX = -1e9, lastProgressStep = 0, stuck = false, crashXs = [], prevCrashes = 0;
      const log = [];
      for (let i = 0; i < 60 * 300 && s.mode !== "finished"; i++) {
        const b = s.bike, raw = b.chassis.getAngle(), w = b.chassis.getAngularVelocity();
        const a = Math.atan2(Math.sin(raw), Math.cos(raw));
        const ground = b.rearOnGround || b.frontOnGround || b.bodyOnGround;
        const px = G.bikePos().x, vel = G.bikeVel(), kmh = Math.hypot(vel.x, vel.y) / PPM * 3.6;
        const target = targetAt(px, scale);
        const inp = Object.assign({}, none);
        if (s.mode === "playing" || s.mode === "ready") {
          if (s.inLoop) { // inside a loop-the-loop: full throttle, stay neutral
            inp.gas = true;
          } else if (ground) {
            if (flipping) { flipping = false; }
            const e = a - b.groundAngle + 0.25 * w; // nose up vs the slope = negative
            inp.leanForward = e < -0.03 || kmh < 15;
            if (kmh < target - 2 && e > -0.25 && (i > 30 || s.mode === "playing")) inp.gas = true;
            if (kmh > target + 6) inp.brake = true;
            if (e < -0.5 && !b.frontOnGround) inp.brake = true;
            if (e > 0.35) { inp.leanBack = true; inp.leanForward = false; }
            if (hold) { inp.gas = i > 36 || s.mode === "playing"; inp.brake = false; } // never lifts, never brakes
            if (s.mode === "ready") { inp.leanForward = true; if (i > 36) inp.gas = true; }
          } else {
            const fx = flipFrom(px);
            if ((flipping || (fx !== null && !flipsDone[fx]))) {
              if (!flipping) { flipping = true; flipsDone[fx] = true; flipTarget = Math.round(raw / (2 * Math.PI)) * 2 * Math.PI - 2 * Math.PI; }
              const e = raw + 0.6 * w - flipTarget;
              if (e > 0.1) { inp.leanBack = true; inp.gas = true; }
              if (e < -0.1) inp.leanForward = true;
            } else {
              // aim for the slope where the bike will land
              const look = px + vel.x * 0.45;
              const sd = slopeDeg(look);
              const aim = sd === null ? 0 : sd * Math.PI / 180;
              const e = a - aim + 0.6 * w;
              if (e < -0.08) inp.leanForward = true;
              if (e > 0.08) inp.leanBack = true;
              if (hold) inp.gas = true;
            }
          }
        }
        Object.assign(G.input, inp);
        G.step();
        if (s.mode === "playing" && !s.inLoop && !(s.zone && s.zone.pad)) maxG = Math.max(maxG, s.bike.riderG || 0);
        if (s.crashes > prevCrashes) { crashXs.push(Math.round(px)); prevCrashes = s.crashes; }
        if (px > lastProgressX + PPM) { lastProgressX = px; lastProgressStep = i; }
        if (i - lastProgressStep > 60 * 15) { stuck = true; log.push("stuck at x " + Math.round(px)); break; }
      }
      Object.assign(G.input, none);
      return { scale, mode: s.mode, timeS: +(G.raceTimeMs() / 1000).toFixed(2), clockS: +(s.timeMs / 1000).toFixed(2),
        crashes: s.crashes, crashXs, flips: s.backflips + s.frontflips, maxRiderG: +maxG.toFixed(1),
        topKmh: +(s.stats.topSpeed * 3.6).toFixed(0), longestJumpM: +s.stats.longestJump.toFixed(1), airS: +(s.stats.airMs / 1000).toFixed(1), stuck, log };
    }
    const rides = scales.map(sc => ride(sc, false));
    const holdRide = ride(1, true); // the "just hold the throttle" rider
    s.paused = false;
    return { name: L.name, checks, rides, holdRide };
  }, [scales, index]);
  report.errors = errors.slice();
  // ---- judge ----
  const problems = [];
  if (report.checks.runOutM < 50) problems.push("run-out only " + report.checks.runOutM + " m (needs 50)");
  report.rides.forEach(r => {
    if (r.mode !== "finished") problems.push("speed x" + r.scale + ": did not finish (" + r.mode + ")");
    if (r.crashes) problems.push("speed x" + r.scale + ": " + r.crashes + " crash(es) at x " + r.crashXs.join(", "));
    if (r.stuck) problems.push("speed x" + r.scale + ": got stuck");
  });
  // Holding the throttle all the time must not be the best way to ride
  const h = report.holdRide, smart = report.rides[1];
  if (h.mode === "finished" && h.crashes === 0 && h.timeS < smart.timeS * 1.05)
    problems.push("holding the throttle is best: " + h.timeS + " s vs " + smart.timeS + " s (needs a crash or 5% slower)");
  if (errors.length) problems.push("console errors: " + errors.join(" | "));
  console.log((problems.length ? "FAIL " : "PASS ") + "Level " + (index + 1) + " (" + report.name + ")  " + report.checks.lengthM + " m, " +
    report.rides.map(r => "x" + r.scale + ": " + r.timeS + " s, " + r.flips + " flip" + (r.flips === 1 ? "" : "s") + ", peak " + r.maxRiderG + " g").join("; ") +
    "; hold-throttle: " + h.mode + " " + h.timeS + " s, " + h.crashes + " crash(es) at x " + h.crashXs.join(", "));
  problems.forEach(x => console.log("     - " + x));
  if (problems.length) failed++;
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
