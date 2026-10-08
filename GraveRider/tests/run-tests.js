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

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("file://" + path.join(ROOT, "index.html"));
  await page.waitForTimeout(1000);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const bike = () => page.evaluate(() => {
    const s = Game.state, c = s.bike.chassis;
    return { x: c.position.x, y: c.position.y, angle: c.angle, mode: s.mode, crashes: s.crashes,
      timeMs: s.timeMs, score: s.score, backflips: s.backflips, frontflips: s.frontflips,
      checkpointIndex: s.checkpointIndex };
  });

  // 1. Page loads without errors
  check("Page loads with no console errors", errors.length === 0, errors.join(" | "));
  await shot("01-start");

  // 2. Hold gas for 5 seconds (real keyboard, real time)
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(300);
  const before = await bike();
  let worstTilt = 0;
  await page.keyboard.down("ArrowUp");
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const b = await bike();
    worstTilt = Math.max(worstTilt, Math.abs(b.angle));
    if (i === 6) await shot("02-gas-hills");
  }
  await page.keyboard.up("ArrowUp");
  const after = await bike();
  check("Gas for 5s moves the bike forward", after.x - before.x > 1000, "moved " + Math.round(after.x - before.x) + "px");
  check("Bike stays upright while accelerating", worstTilt < 1.2 && after.crashes === 0,
    "max tilt " + worstTilt.toFixed(2) + " rad, crashes " + after.crashes);

  // 3. Lean in the air rotates the bike
  await page.keyboard.press("KeyR");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -900 }));
  const a0 = (await bike()).angle;
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(600);
  await shot("03-air-lean");
  await page.keyboard.up("ArrowLeft");
  const a1 = (await bike()).angle;
  check("Leaning back in the air rotates the bike backwards", a1 - a0 < -1.5, "rotated " + (a1 - a0).toFixed(2) + " rad");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -900 }));
  const f0 = (await bike()).angle;
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowRight");
  const f1 = (await bike()).angle;
  check("Leaning forward in the air rotates the bike forwards", f1 - f0 > 1.5, "rotated " + (f1 - f0).toFixed(2) + " rad");

  // 4. Headfirst into the ground = crash, then auto restart
  await page.keyboard.press("KeyR");
  await page.evaluate(() => Game.spawnBike({ x: 200, y: -500 }));
  // Lean forward until upside down, then hold it there while falling
  let crashed = false, held = "";
  for (let i = 0; i < 200 && !crashed; i++) {
    const b = await bike();
    crashed = b.mode === "crashed";
    const want = b.angle < Math.PI - 0.25 ? "ArrowRight" : b.angle > Math.PI + 0.25 ? "ArrowLeft" : "";
    if (want !== held) {
      if (held) await page.keyboard.up(held);
      if (want) await page.keyboard.down(want);
      held = want;
    }
    await page.waitForTimeout(15);
  }
  if (held) await page.keyboard.up(held);
  await shot("04-crash");
  check("Landing on the head is detected as a crash", crashed);
  await page.waitForTimeout(1300);
  const re = await bike();
  check("After a crash the bike restarts at the last checkpoint", re.mode === "playing" && Math.abs(re.x - 0) < 60,
    "mode " + re.mode + ", x " + Math.round(re.x));

  // 5. Autopilot drive: checkpoint, low-gravity zone, a backflip, and the finish
  await page.keyboard.press("KeyR");
  const run = await page.evaluate(() => {
    const G = Game, s = G.state;
    s.paused = true;
    let sawZone = false, zoneGravity = 0, flipDone = false, startRot = 0, leaning = false;
    for (let i = 0; i < 60 * 90 && s.mode !== "finished"; i++) {
      const b = s.bike, raw = b.chassis.angle, ground = b.rearOnGround || b.frontOnGround;
      const a = Math.atan2(Math.sin(raw), Math.cos(raw)); // tilt between -PI and PI
      const inp = { gas: true, brake: false, leanBack: false, leanForward: false };
      if (ground) leaning = false;
      if (s.zone && !ground && !flipDone && b.chassis.position.x > 6400) {
        // In the low-gravity jump: do one backflip
        if (!leaning) { leaning = true; startRot = raw; }
        if (raw - startRot > -2 * Math.PI + 0.6) inp.leanBack = true; else flipDone = true;
      } else if (ground) {
        if (a < -0.35) inp.leanForward = true;
        if (a > 0.5) inp.leanBack = true;
      } else {
        if (a < -0.15) inp.leanForward = true;
        if (a > 0.15) inp.leanBack = true;
      }
      Object.assign(G.input, inp);
      G.step();
      if (s.zone) { sawZone = true; zoneGravity = G.engine.gravity.scale; }
    }
    Object.assign(G.input, { gas: false, brake: false, leanBack: false, leanForward: false });
    s.paused = false;
    return { mode: s.mode, sawZone, zoneGravity, backflips: s.backflips, score: s.score,
      cp: s.checkpointIndex, crashes: s.crashes, timeMs: s.timeMs };
  });
  check("Checkpoint is reached", run.cp === 0);
  check("Low-gravity zone changes gravity", run.sawZone && run.zoneGravity < 0.0005, "gravity scale " + run.zoneGravity);
  check("Backflip is detected and scored", run.backflips >= 1 && run.score > 0, "backflips " + run.backflips + ", score " + run.score);
  check("Finish line ends the level", run.mode === "finished",
    "time " + (run.timeMs / 1000).toFixed(1) + "s, crashes " + run.crashes);
  await page.waitForTimeout(200);
  await shot("05-finish");

  // 6. Frontflip from a high drop, brake/reverse, and checkpoint respawn
  await page.keyboard.press("KeyR");
  const extra = await page.evaluate(() => {
    const G = Game, s = G.state, none = { gas: false, brake: false, leanBack: false, leanForward: false };
    s.paused = true;
    // Frontflip: lean forward one full turn, then level out before landing
    G.spawnBike({ x: 300, y: -1100 });
    for (let i = 0; i < 400; i++) {
      const raw = s.bike.chassis.angle, a = Math.atan2(Math.sin(raw), Math.cos(raw));
      const inp = Object.assign({}, none);
      if (raw < 2 * Math.PI - 0.6) inp.leanForward = true;
      else if (a > 0.1) inp.leanBack = true;
      else if (a < -0.1) inp.leanForward = true;
      Object.assign(G.input, inp);
      G.step();
    }
    const frontflips = s.frontflips, flipCrashes = s.crashes;
    // Brake: get up to speed, then hold brake
    G.loadLevel(0);
    Object.assign(G.input, none, { gas: true });
    for (let i = 0; i < 40; i++) G.step();
    const fast = s.bike.chassis.velocity.x;
    Object.assign(G.input, none, { brake: true });
    for (let i = 0; i < 40; i++) G.step();
    const braked = s.bike.chassis.velocity.x;
    // Reverse: keep holding brake once stopped
    for (let i = 0; i < 120; i++) G.step();
    const reversing = s.bike.chassis.velocity.x;
    // Checkpoint respawn: pass the checkpoint, then crash
    const cp = s.level.checkpoints[0];
    G.spawnBike({ x: cp.x + 100, y: cp.y });
    Object.assign(G.input, none);
    G.step();
    const reachedCp = s.checkpointIndex;
    G.spawnBike({ x: cp.x + 300, y: cp.y - 300 });
    for (let i = 0; i < 300 && s.mode === "playing"; i++) {
      const raw = s.bike.chassis.angle;
      Object.assign(G.input, none, raw < Math.PI - 0.2 ? { leanForward: true } : raw > Math.PI + 0.2 ? { leanBack: true } : {});
      G.step();
    }
    const crashedAfterCp = s.mode === "crashed";
    Object.assign(G.input, none);
    for (let i = 0; i < 70; i++) G.step();
    const respawnX = s.bike.chassis.position.x;
    s.paused = false;
    return { frontflips, flipCrashes, fast, braked, reversing, reachedCp, crashedAfterCp, respawnX, cpX: cp.x, mode: s.mode };
  });
  check("Frontflip is detected", extra.frontflips === 1 && extra.flipCrashes === 0,
    "frontflips " + extra.frontflips + ", crashes " + extra.flipCrashes);
  check("Brake slows the bike down", extra.braked < extra.fast * 0.5,
    "speed " + extra.fast.toFixed(1) + " -> " + extra.braked.toFixed(1));
  check("Holding brake when stopped reverses", extra.reversing < -0.5, "speed " + extra.reversing.toFixed(1));
  check("Crash after the checkpoint respawns at the checkpoint",
    extra.reachedCp === 0 && extra.crashedAfterCp && Math.abs(extra.respawnX - extra.cpX) < 60 && extra.mode === "playing",
    "respawned at x " + Math.round(extra.respawnX) + " (checkpoint " + extra.cpX + ")");

  // 7. R restarts the level
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(200);
  const r = await bike();
  check("R restarts the level", r.mode === "playing" && r.timeMs < 500 && Math.abs(r.x) < 60 && r.score === 0);

  // 8. Tuning panel: T opens it, sliders change values, copy works
  await page.keyboard.press("KeyT");
  const open = await page.isVisible("#tuning");
  await page.locator("#tuning input[type=range]").first().fill("1.5");
  const grav = await page.evaluate(() => CONFIG.gravity);
  await page.click("#tuning-copy");
  await page.waitForTimeout(200);
  const copied = await page.inputValue("#tuning-text");
  await shot("06-tuning");
  check("T opens the tuning panel", open);
  check("Gravity slider changes the setting", grav === 1.5, "gravity " + grav);
  check("Copy settings produces the values as text", copied.includes("gravity: 1.5") && copied.includes("wheelGrip"));
  await page.click("#tuning-reset");
  await page.keyboard.press("KeyT");
  check("T closes the tuning panel", !(await page.isVisible("#tuning")));

  check("No console errors during all tests", errors.length === 0, errors.join(" | "));
  await browser.close();

  const failed = results.filter((x) => !x.ok).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " tests passed");
  process.exit(failed ? 1 : 0);
})();
