// =====================================================
// GRAVE RIDER — PHYSICS REPORT
// Runs real experiments in the game's physics engine and
// writes the results to PHYSICS_REPORT.md.
// Run from the GraveRider folder:  node tests/physics-report.js
// =====================================================
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.waitForTimeout(300);

  const R = await page.evaluate(() => {
    const G = Game, s = G.state, PPM = CONFIG.pixelsPerMetre;
    s.paused = true;
    const DT = CONFIG.physicsStepSec;
    const none = { gas: false, brake: false, leanBack: false, leanForward: false };

    // Build a test track from points given in metres
    function track(pointsM, startXM) {
      const pts = pointsM.map(p => ({ x: p[0] * PPM, y: -p[1] * PPM }));
      LEVELS[9] = { name: "lab", physics: {}, groundColor: "#000", groundTopColor: "#000",
        start: { x: startXM * PPM, y: -0.66 * PPM }, checkpoints: [], finish: { x: 1e9 },
        fallLimitY: 1e9, terrain: [pts], zones: [] };
      G.loadLevel(9);
    }
    function reset() { Object.assign(CONFIG, JSON.parse(JSON.stringify(CONFIG_DEFAULTS))); }
    const pos = () => { const p = s.bike.chassis.getWorldCenter(); return { x: p.x, y: -p.y }; };
    const speed = () => { const v = s.bike.chassis.getLinearVelocity(); return Math.hypot(v.x, v.y); };
    const pitchDeg = () => -s.bike.chassis.getAngle() * 180 / Math.PI; // + = nose up
    function settle(n) { Object.assign(G.input, none); for (let i = 0; i < (n || 90); i++) G.step(); }
    function run(inp, steps, every) {
      Object.assign(G.input, none, inp);
      for (let i = 0; i < steps; i++) { G.step(); if (every) every(i); if (s.mode !== "playing") break; }
    }
    const out = {};

    // ---- 1. Suspension sag ----
    reset(); track([[-50, 0], [500, 0]], 0); settle(120);
    out.sag = { rear: Bike.compression(s.bike.rear), front: Bike.compression(s.bike.front) };

    // ---- 2. Acceleration on flat ground, holding full throttle ----
    function accel(throttleControl) {
      reset(); CONFIG.throttleControl = throttleControl;
      track([[-50, 0], [3000, 0]], 0); settle(60);
      const r = { t50: null, t100: null, maxPitch: 0, crashed: false, topSpeed: 0 };
      const x0 = pos().x; let t = 0;
      run({ gas: true }, 60 * 30, () => {
        t += DT; const v = speed() * 3.6;
        if (r.t50 === null && v >= 50) r.t50 = t;
        if (r.t100 === null && v >= 100) r.t100 = t;
        if (Math.abs(t - 5) < DT / 2) r.dist5 = pos().x - x0;
        r.maxPitch = Math.max(r.maxPitch, pitchDeg());
        r.topSpeed = Math.max(r.topSpeed, v);
      });
      r.crashed = s.mode === "crashed"; r.time = t;
      return r;
    }
    out.accel = accel(1);
    out.accelRaw = accel(0);

    // ---- 3. Braking from 60 km/h ----
    reset(); track([[-50, 0], [3000, 0]], 0); settle(60);
    for (let i = 0; i < 60 * 20 && speed() * 3.6 < 60; i++) {
      Object.assign(G.input, none, { gas: true, leanForward: pitchDeg() > 8 }); G.step();
    }
    { const x0 = pos().x; let t = 0;
      Object.assign(G.input, none, { brake: true });
      // stop measuring when stopped (holding brake longer would start reversing)
      while (s.bike.chassis.getLinearVelocity().x > 0.5 && t < 10) { G.step(); t += DT; }
      out.brake = { dist: pos().x - x0, time: t, pitch: pitchDeg() }; }

    // ---- 4. Hill climbing: straight hills of different angles, 10 m tall ----
    // Bike placed on a long straight slope, already moving at v0 (m/s)
    function hill(deg, runUpKmh) {
      reset();
      const t = Math.tan(deg * Math.PI / 180), v0 = runUpKmh / 3.6;
      LEVELS[9] = { name: "lab", physics: {}, groundColor: "#000", groundTopColor: "#000",
        start: { x: 20 * PPM, y: -(20 * t + 0.95) * PPM }, checkpoints: [], finish: { x: 1e9 }, fallLimitY: 1e9,
        terrain: [[{ x: -50 * PPM, y: 0 }, { x: 0, y: 0 }, { x: 400 * PPM, y: -400 * t * PPM }]], zones: [] };
      G.loadLevel(9);
      const b = s.bike, ang = -Math.atan(t), c = b.chassis.getPosition();
      const dir = planck.Vec2(Math.cos(ang) * v0, Math.sin(ang) * v0);
      [b.chassis, b.rider, b.rear.wheel, b.front.wheel].forEach(body => {
        const p = body.getPosition(), dx = p.x - c.x, dy = p.y - c.y;
        body.setTransform(planck.Vec2(c.x + dx * Math.cos(ang) - dy * Math.sin(ang), c.y + dx * Math.sin(ang) + dy * Math.cos(ang)), body.getAngle() + ang);
        body.setLinearVelocity(dir);
      });
      b.rear.wheel.setAngularVelocity(v0 / CONFIG.rearWheelRadius);
      b.front.wheel.setAngularVelocity(v0 / CONFIG.frontWheelRadius);
      const along = () => { const v = s.bike.chassis.getLinearVelocity(); return (v.x - v.y * t) / Math.sqrt(1 + t * t); };
      const y0 = pos().y; let best = 0, tt = 0;
      while (tt < 6 && s.mode === "playing") {
        Object.assign(G.input, none, { gas: true, leanForward: pitchDeg() - deg > 10 });
        G.step(); tt += DT;
        best = Math.max(best, pos().y - y0);
      }
      const vEnd = along() * 3.6;
      return { deg, runUpKmh, made: s.mode === "playing" && vEnd > 1, crashed: s.mode !== "playing",
        topSpeed: s.mode === "playing" ? vEnd : null, height: best, time: tt };
    }
    out.hills = [];
    [15, 20, 25, 30, 35, 40, 45, 50].forEach(d => { out.hills.push(hill(d, 0)); out.hills.push(hill(d, 50)); });

    // ---- 5. Leaning in the air (bike dropped from 20 m, 1 s of lean) ----
    function airLean(assist, key) {
      reset(); CONFIG.flipAssist = assist;
      track([[-50, 0], [500, 0]], 0);
      G.spawnBike({ x: 0, y: -30 * PPM });
      const a0 = s.bike.chassis.getAngle();
      run({ [key]: true }, 60);
      const a1 = s.bike.chassis.getAngle();
      run({}, 30);
      return { deg: (a1 - a0) * 180 / Math.PI, spinAfter: s.bike.chassis.getAngularVelocity() * 180 / Math.PI };
    }
    out.lean = {
      realBack: airLean(0, "leanBack"), realFwd: airLean(0, "leanForward"),
      assistBack: airLean(CONFIG_DEFAULTS.flipAssist, "leanBack")
    };

    // ---- 6. Throttle / brake in the air (spinning wheel twists the bike) ----
    function airWheel(inp, rawThrottle) {
      reset(); CONFIG.flipAssist = 0; CONFIG.throttleControl = rawThrottle ? 0 : 1;
      track([[-50, 0], [500, 0]], 0);
      G.spawnBike({ x: 0, y: -30 * PPM });
      // give the rear wheel some spin first (like leaving a jump at 40 km/h)
      s.bike.rear.wheel.setAngularVelocity(11 / CONFIG.rearWheelRadius);
      s.bike.front.wheel.setAngularVelocity(11 / CONFIG.frontWheelRadius);
      s.bike.chassis.setLinearVelocity(planck.Vec2(11, 0));
      s.bike.rider.setLinearVelocity(planck.Vec2(11, 0));
      s.bike.rear.wheel.setLinearVelocity(planck.Vec2(11, 0));
      s.bike.front.wheel.setLinearVelocity(planck.Vec2(11, 0));
      const a0 = s.bike.chassis.getAngle();
      run(inp, 30);
      return (s.bike.chassis.getAngle() - a0) * -180 / Math.PI; // + = nose up
    }
    out.airWheel = { brake: airWheel({ brake: true }), throttleRaw: airWheel({ gas: true }, true),
      throttleRider: airWheel({ gas: true }, false) };

    // ---- 7. Drops onto flat ground (bike level, rider standing) ----
    function drop(hm) {
      reset(); track([[-50, 0], [500, 0]], 0);
      G.spawnBike({ x: 0, y: -(hm + 0.66) * PPM });
      let maxR = 0, maxF = 0;
      run({}, 240, () => { maxR = Math.max(maxR, Bike.compression(s.bike.rear)); maxF = Math.max(maxF, Bike.compression(s.bike.front)); });
      return { h: hm, rear: maxR / CONFIG.rearTravel, front: maxF / CONFIG.frontTravel, crashed: s.crashes > 0 };
    }
    out.drops = [0.5, 1, 2, 3, 5].map(drop);

    reset(); delete LEVELS[9]; LEVELS.length = 1; G.loadLevel(0); s.paused = false;
    out.config = JSON.parse(JSON.stringify(CONFIG));
    return out;
  });
  await browser.close();

  // ---- Write the report ----
  const C = R.config, f1 = (x) => x == null ? "—" : x.toFixed(1), f0 = (x) => x == null ? "—" : x.toFixed(0);
  const g = 9.81, total = C.bikeMass + C.riderMass;
  const tractionAccel = C.wheelGrip * g;
  const torqueAccel = C.wheelTorque / C.rearWheelRadius / total;
  const powerSpeed = (deg) => { // speed where motor power = gravity + drag + rolling (steady climb)
    let v = 1; for (let i = 0; i < 200; i++) {
      const F = total * g * Math.sin(deg * Math.PI / 180) + 0.5 * C.airDensity * C.dragArea * v * v + C.rollingResistance * total * g;
      v = Math.min(C.topSpeed, C.motorPower / F);
    } return v; };
  const L = [];
  L.push("# Grave Rider — physics report", "");
  L.push("Generated by `node tests/physics-report.js`. Every number below comes from running the");
  L.push("game's own physics engine (Planck.js) with the bike set up as in `js/config.js`:");
  L.push(`${C.bikeMass} kg bike + ${C.riderMass} kg rider, ${C.motorPower / 1000} kW, ${C.wheelTorque} N·m at the rear wheel, ` +
    `${(C.topSpeed * 3.6).toFixed(0)} km/h top speed, ${C.frontTravel * 1000}/${C.rearTravel * 1000} mm travel, grip ${C.wheelGrip}.`, "");
  L.push("## Quick physics check (pen-and-paper)", "");
  L.push(`- Most acceleration the tyre can give on dirt: grip × g = **${tractionAccel.toFixed(1)} m/s²**.`);
  L.push(`- What the motor alone could push: ${C.wheelTorque} N·m ÷ ${C.rearWheelRadius} m ÷ ${total} kg = **${torqueAccel.toFixed(1)} m/s²**.`);
  L.push(`- So below about ${(C.motorPower / (C.wheelTorque / C.rearWheelRadius) * 3.6).toFixed(0)} km/h the bike has more torque than the tyre or`);
  L.push("  the wheelie limit can use. It is limited by grip and by the front wheel lifting, not by the motor.");
  L.push(`- Steepest hill the tyre could hold even at a crawl (if all weight were on the rear): atan(grip) = **${(Math.atan(C.wheelGrip) * 180 / Math.PI).toFixed(0)}°**. Real limit is lower because the front wheel lifts.`, "");

  L.push("## Suspension", "");
  L.push(`- Sag with the rider standing still: rear **${(R.sag.rear * 1000).toFixed(0)} mm** (${(R.sag.rear / C.rearTravel * 100).toFixed(0)}% of travel), front **${(R.sag.front * 1000).toFixed(0)} mm** (${(R.sag.front / C.frontTravel * 100).toFixed(0)}%). Typical motocross race sag is ~100 mm rear.`, "");
  L.push("| Drop onto flat ground | Rear travel used | Front travel used | Rider crashes? |", "|---|---|---|---|");
  R.drops.forEach(d => L.push(`| ${d.h} m | ${(d.rear * 100).toFixed(0)}% | ${(d.front * 100).toFixed(0)}% | ${d.crashed ? "yes" : "no"} |`));
  L.push("", "Over 100% means it hit the bottoming stop (a real bike would bottom out too).");
  L.push("The rider's legs are not modelled as springs, so landings here are a bit harsher than real life", "(a real rider soaks up part of a landing with their legs).", "");

  L.push("## Acceleration (flat ground, full throttle)", "");
  L.push("| | 0–50 km/h | 0–100 km/h | Distance in 5 s | Highest wheelie | Top speed reached | Flipped over? |", "|---|---|---|---|---|---|---|");
  [["With rider throttle control (game default)", R.accel], ["Throttle pinned, no rider control", R.accelRaw]].forEach(([n, a]) =>
    L.push(`| ${n} | ${a.t50 == null ? "—" : f1(a.t50) + " s"} | ${a.t100 == null ? "—" : f1(a.t100) + " s"} | ${a.dist5 == null ? "—" : f0(a.dist5) + " m"} | ${f0(a.maxPitch)}° | ${f0(a.topSpeed)} km/h | ${a.crashed ? "yes, after " + f1(a.time) + " s" : "no"} |`));
  L.push("", `Steady top speed on flat ground from power vs drag: ${(powerSpeed(0) * 3.6).toFixed(0)} km/h (capped by the motor's max speed).`, "");

  L.push("## Braking from 60 km/h (front + rear)", "");
  L.push(`- Stops in **${f1(R.brake.dist)} m** and **${f1(R.brake.time)} s**.`, "");

  L.push("## Hill climbing (long straight slope, full throttle for 6 s, rider keeping the front down)", "");
  L.push("| Slope | Start speed | Still climbing after 6 s? | Height gained | Speed after 6 s | Max steady speed if grip were unlimited (power limit) |", "|---|---|---|---|---|---|");
  R.hills.forEach(h => L.push(`| ${h.deg}° | ${h.runUpKmh ? h.runUpKmh + " km/h" : "standstill"} | ${h.made ? "yes" : (h.crashed ? "no — loops over / crashes" : "no — stops and slides back")} | ${h.height.toFixed(1)} m | ${h.topSpeed == null ? "—" : f0(Math.max(0, h.topSpeed)) + " km/h"} | ${(powerSpeed(h.deg) * 3.6).toFixed(0)} km/h |`));
  L.push("", "With 50 km/h of run-up the bike also carries momentum: speed alone is worth about 10 m of height.");
  L.push("");

  L.push("## How much leaning actually does (in the air, 1 second)", "");
  L.push(`- **Real life (flip assist 0):** leaning back for 1 s turns the bike **${f0(Math.abs(R.lean.realBack.deg))}° nose-up**; leaning forward **${f0(Math.abs(R.lean.realFwd.deg))}° nose-down**.`);
  L.push("  The rider and bike turn against each other (angular momentum is conserved), so a weight shift alone");
  L.push("  can't flip the bike. Real backflips come from the take-off ramp and the throttle/brake.");
  L.push(`- **Game default (flip assist ${C.flipAssist} N·m):** leaning back for 1 s turns the bike **${f0(Math.abs(R.lean.assistBack.deg))}°** (almost a full backflip).`, "");
  L.push("## Throttle and brake in the air (0.5 s, leaving a jump at 40 km/h)", "");
  L.push(`- Rear brake: nose drops **${f0(-R.airWheel.brake)}°** (the spinning wheel's momentum moves into the bike).`);
  L.push(`- Throttle pinned: nose rises **${f0(R.airWheel.throttleRaw)}°** (real riders use this to lift the front).`);
  L.push(`- Throttle with rider control (game default): nose moves **${f0(Math.abs(R.airWheel.throttleRider))}°** (the rider holds the throttle steady in the air).`, "");
  fs.writeFileSync(path.join(ROOT, "PHYSICS_REPORT.md"), L.join("\n") + "\n");
  console.log(L.join("\n"));
})();
