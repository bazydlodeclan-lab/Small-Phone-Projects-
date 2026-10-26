// =====================================================
// GRAVE RIDER — LEVEL DATA
// Each level is plain data. Coordinates are in pixels:
// x grows to the right, y grows DOWNWARD (so -200 is
// higher up than 0).
//
// physics (all optional, per level):
//   gravityScale  multiplies the base gravity (0.4 = moon)
//   gravityDir    {x, y} direction of gravity ({x:0,y:-1} = ceiling)
//   bounce        0 = no bounce, 1 = super bouncy
//   friction      multiplies tyre grip (0.3 = icy)
//
// zones: rectangles that change physics while the bike
// is inside them. They use the same physics keys.
// =====================================================

// --- Helpers that generate ground shapes ---
var Shapes = {
  // A straight line from (x0, y0) to (x1, y1)
  line: function (x0, y0, x1, y1) {
    return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  },
  // Smooth rolling hills between x0 and x1 around height y
  hills: function (x0, x1, y, height, width) {
    var pts = [];
    for (var x = x0; x <= x1; x += 25) {
      var t = (x - x0) / width;
      pts.push({ x: x, y: y - height * (0.5 - 0.5 * Math.cos(t * Math.PI * 2)) });
    }
    return pts;
  },
  // Smooth S-shaped curve from (x0, y0) to (x1, y1)
  curve: function (x0, y0, x1, y1, steps) {
    var pts = [];
    steps = steps || 12;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var s = 0.5 - 0.5 * Math.cos(t * Math.PI);
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * s });
    }
    return pts;
  },
  // A ramp that curves upward more and more (good for jumps)
  kicker: function (x0, y0, x1, y1, steps) {
    var pts = [];
    steps = steps || 12;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t * t });
    }
    return pts;
  },
  // A loop-the-loop with its bottom at (x, y) and radius R (pixels): you ride in
  // at the bottom, up the right side, upside down across the top (moving left),
  // down the left side and out again. Returns three terrain pieces (entry arc,
  // main arc, exit arc) tagged with a loop number; the entry arc stops being
  // solid once you are over the top (otherwise it would block the exit).
  // Put the floor in front of the loop ending at (x, y) and the floor after it
  // starting at (x, y). `id` is any number, different for each loop of a level.
  loop: function (x, y, R, id) {
    var cx = x, cy = y - R, entry = [], main = [], exit = [];
    function pt(deg) { var a = deg * Math.PI / 180; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; }
    var steps = 48;
    for (var i = 0; i <= steps; i++) { // 90 deg (bottom) -> 0 (right) -> -90 (top) -> -180 (left) -> -270 (bottom)
      var d = 90 - i * 360 / steps, p = pt(d);
      if (d > 0) entry.push(p);
      if (d <= 10 && d >= -190) main.push(p);
      if (d < -180 || d === -180) exit.push(p);
    }
    entry.push(pt(0)); main.unshift(pt(10)); // overlap the pieces by one point so there is no gap
    return [
      { points: entry, ring: true, loop: id, role: "entry", cx: cx, cy: cy, R: R },
      { points: main, ring: true, loop: id, role: "main", cx: cx, cy: cy, R: R },
      { points: exit, ring: true, loop: id, role: "exit", cx: cx, cy: cy, R: R }
    ];
  },
  // Joins several point lists into one ground line (drops duplicate joints)
  join: function () {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var part = arguments[i];
      for (var j = 0; j < part.length; j++) {
        var p = part[j];
        var last = out[out.length - 1];
        if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
        out.push(p);
      }
    }
    return out;
  }
};

// The test track: not one of the 4 levels you play (the automated tests ride it)
var TEST_TRACK =
  {
    name: "Test Track",
    physics: { gravityScale: 1, gravityDir: { x: 0, y: 1 }, bounce: 0, friction: 1 },
    groundColor: "#6b4f3a",
    groundTopColor: "#a07e5e",

    start: { x: 0, y: -40 },
    checkpoints: [{ x: 4500, y: -40 }],
    finish: { x: 9000 },
    fallLimitY: 900, // falling below this counts as a crash

    // Each array is one continuous piece of ground. A gap between
    // two pieces is a hole you have to jump.
    terrain: [
      Shapes.join(
        // Flat start
        Shapes.line(-600, 0, 500, 0),
        // Rolling hills
        Shapes.hills(500, 2100, 0, 28, 800),
        // Flat, then a small ramp (a low tabletop jump)
        Shapes.line(2100, 0, 2350, 0),
        Shapes.curve(2350, 0, 2560, -45, 10),
        Shapes.line(2560, -45, 2600, -45),
        Shapes.curve(2600, -45, 2760, 0, 8),
        // Run-up to the big ramp
        Shapes.line(2760, 0, 3150, 0),
        // Big ramp
        Shapes.kicker(3150, 0, 3420, -105, 14),
        // Cliff edge into the gap
        [{ x: 3430, y: -105 }, { x: 3438, y: 1200 }]
      ),
      Shapes.join(
        // Far side of the gap: landing slope back down to the ground
        [{ x: 3620, y: 1200 }, { x: 3630, y: -70 }],
        Shapes.curve(3630, -70, 4250, 0, 14),
        // Flat with the checkpoint
        Shapes.line(4250, 0, 4800, 0),
        // Steep hill up, a plateau, and back down
        Shapes.curve(4800, 0, 5400, -300, 16),
        Shapes.line(5400, -300, 5550, -300),
        Shapes.curve(5550, -300, 6250, 0, 18),
        Shapes.line(6250, 0, 6600, 0),
        // Big motocross double jump (real size: 2.2 m tall, 30° take-off face
        // with a smooth 8 m transition, 14 m gap; needs about 13 m/s).
        // Coming up short lands you on the flat between.
        Shapes.kicker(6600, 0, 6900, -87, 12),
        [{ x: 6992, y: -140 }, { x: 7002, y: -140 }],
        Shapes.curve(7002, -140, 7070, 0, 6),
        Shapes.line(7070, 0, 7700, 0),
        // Landing ramp: 40° back face (climbable if you come up short)
        [{ x: 7867, y: -140 }, { x: 7920, y: -140 }],
        Shapes.curve(7920, -140, 8800, 0, 20),
        // Run-out: room to brake to a stop after the finish (about 50 m)
        Shapes.line(8800, 0, 12200, 0),
        // End wall so you can't drive off the world
        [{ x: 12400, y: -600 }]
      )
    ],

    // Physics zones (none on the test track for now; the system still works,
    // e.g. { x, y, w, h, label, color, physics: { gravityScale: 0.35 } })
    zones: []
  };

// ---------------- LEVEL BUILDER ----------------
// Builds a level from pieces, each starting where the last one ended (like a real
// motocross track laid out piece by piece, with no turns). Pieces:
//   flat(dx)            level ground          ramp(dx, dy)   straight slope (dy < 0 = up)
//   lip(dx, dy)         slope that curves up more and more (the take-off)
//   ease(dx, dy)        slope that eases out to flat (the end of a landing)
//   bump(dx, dy)        smooth S-shaped change of height
//   whoops(n, wave, h)  n small bumps in a row, `wave` px apart, `h` px high
//   table(...)          tabletop: lip, flat top, long landing
//   loop(R)             a loop-the-loop (Bat level)
//   checkpoint()        a checkpoint flag at the current spot
//   pad(w, label, bounce)  a pumpkin trampoline zone over the next w px of ground
function LevelBuilder(opts) {
  var landScale = (opts && opts.landScale) || 1;
  var pts = [{ x: -600, y: 0 }], cp = [], zones = [], terrain = [], loops = 0, rides = [];
  var cx = -600, cy = 0;
  function lowestY() { // lowest ground point (y grows downward): the fall limit sits below the whole track
    var m = cy;
    terrain.concat([pts]).forEach(function (piece) { (piece.points || piece).forEach(function (p) { if (p.y > m) m = p.y; }); });
    return m;
  }
  var b = {
    add: function (list) { // list = absolute points; continue from its last point
      list.forEach(function (p) { if (Math.abs(p.x - cx) > 0.01 || Math.abs(p.y - cy) > 0.01) pts.push(p); });
      var l = list[list.length - 1]; cx = l.x; cy = l.y;
    },
    x: function () { return cx; },
    y: function () { return cy; },
    flat: function (dx) { b.add([{ x: cx + dx, y: cy }]); },
    ramp: function (dx, dy) { b.add([{ x: cx + dx, y: cy + dy }]); },
    lip: function (dx, dy) { b.add(Shapes.kicker(cx, cy, cx + dx, cy + dy, 12)); },
    ease: function (dx, dy) { b.add(Shapes.kicker(cx + dx, cy + dy, cx, cy, 12).reverse()); },
    bump: function (dx, dy) { b.add(Shapes.curve(cx, cy, cx + dx, cy + dy, 14)); },
    hills: function (len, h, wave) { var x0 = cx, y0 = cy; b.add(Shapes.hills(x0, x0 + len, y0, h, wave)); cx = x0 + len; cy = y0; },
    whoops: function (n, wave, h) { b.hills(n * wave, h, wave); },
    checkpoint: function () { cp.push({ x: cx, y: cy - 40 }); },
    table: function (lipDx, lipDy, top, landDx, landDy, easeDx, easeDy) {
      b.lip(lipDx, lipDy); b.flat(top); b.ramp(80, -lipDy * 0.17); b.ramp(landDx, landDy); b.ease(easeDx, easeDy);
    },
    // Freestyle ramp: a big steep kicker, a wide gap and a high landing ramp with a long
    // downhill landing, so a rider with speed (about 67 km/h) can throw a backflip.
    // Slower riders land on the flat in the gap and ride up the landing ramp. The ramp's
    // marker also tells the automated test rider to go for the flip. `gap` stretches the
    // ramp for low gravity (1 = normal).
    freestyle: function (gap) {
      gap = gap || 1;
      var takeoffKmh = 78, before = rides.length ? rides[rides.length - 1].kmh : 45;
      b.speed(takeoffKmh, false, undefined, true);
      b.flat(1800 * gap);                 // run-up: room to get up to speed
      var x0 = cx, y0 = cy;
      b.speed(takeoffKmh, true, x0 - 100, true);
      b.add(Shapes.kicker(x0, y0, x0 + 300, y0 - 140, 14));
      b.add([{ x: x0 + 304, y: y0 - 140 }, { x: x0 + 310, y: y0 }]);
      b.flat(1300 * gap);
      b.add(Shapes.curve(cx, cy, cx + 160, cy - 80, 8)); // landing ramp face (rideable if you come up short)
      b.flat(40);
      b.steep(50, 0, 0);                                 // steep landing zone right after the face (the gap above is its own)
      b.flat(300);
      b.speed(before);
    },
    // Landing zone (owner request: big jumps land on a steep 45-70 degree downhill that rounds
    // out gradually, like a real motocross landing, and it must be where you ACTUALLY land,
    // also for riders who hold the throttle). Physics fact: the steeper the ground falls away,
    // the later a flying bike comes down, and a rider at 130+ km/h flies 100-175 m. So, from
    // the end of the jump:
    //  1. a flat gap (about 19 m; slower riders come down here and just roll on)
    //  2. the head (about 28 m): starts at `deg` degrees (45-70) and eases to about 29 degrees
    //  3. the plateau (about 34 m): a steady 29 -> 22 degree slope where fast flyers land
    //  4. the tail (about 22 m): eases to 7 degrees, then 12 m rounding out to flat
    // About 45 m of height is lost in all. `drop` is no longer used. `gapPx` overrides the flat
    // gap (the freestyle ramps have their own). Moon levels build with
    // LevelBuilder({ landScale: 1.5 }) to stretch everything for low gravity.
    steep: function (deg, drop, gapPx) {
      var k = landScale, s0 = Math.tan(deg * Math.PI / 180), sA = 0.55, sB = 0.4, sC = 0.12;
      var G = (gapPx === undefined ? 1200 : gapPx) * k, H = 1800 * k, P = 2200 * k, T = 1400 * k, R = 800 * k, pts2 = [], x = cx, y = cy, i, sl;
      if (G > 0) { x += G; pts2.push({ x: x, y: y }); }
      for (i = 1; i <= 20; i++) { // head: slope eases from s0 down to about 33 degrees
        sl = sA + (s0 - sA) * Math.pow(1 - i / 20, 1.3);
        x += H / 20; y += sl * (H / 20); pts2.push({ x: x, y: y });
      }
      for (i = 1; i <= 15; i++) { // plateau: a long, steady slope (33 down to 27 degrees) where the fast flyers land
        sl = sA + (sB - sA) * i / 15;
        x += P / 15; y += sl * (P / 15); pts2.push({ x: x, y: y });
      }
      for (i = 1; i <= 10; i++) { // tail: eases from 27 down to 9 degrees
        sl = sB + (sC - sB) * i / 10;
        x += T / 10; y += sl * (T / 10); pts2.push({ x: x, y: y });
      }
      for (i = 1; i <= 12; i++) { // round-out: slope eases from 9 degrees down to 0
        sl = sC * (1 - i / 12) * (1 - i / 12);
        x += R / 12; y += sl * (R / 12); pts2.push({ x: x, y: y });
      }
      b.add(pts2);
    },
    // Where the automated test rider should aim for a speed (km/h) from here on
    speed: function (kmh, flip, x, fixed) { // fixed: the test rider keeps this speed at 0.9x / 1.1x too
      rides.push({ x: x === undefined ? cx : x, kmh: kmh, flip: !!flip, fixed: !!fixed });
    },
    pad: function (w, label, bounce) { // call just before the flat ground the pumpkins sit on
      zones.push({ x: cx, y: cy - 400, w: w, h: 600, pad: true, label: label, color: "rgba(255,140,30,0.10)", physics: { bounce: bounce || 0.8 } });
    },
    loop: function (R) { // ride in at the bottom, round the circle, out the other side
      b.flat(R * 0.6); // room before the loop (the loop is bigger than a rider's run-up needs)
      pts.push({ x: cx, y: cy });
      terrain.push(pts);
      var parts = Shapes.loop(cx, cy, R, ++loops);
      parts.forEach(function (q) { terrain.push(q); });
      pts = [{ x: cx, y: cy }];
    },
    // Ends the level: run-out for braking after the finish line, then an end wall
    build: function (o) {
      var finishX = cx;
      b.flat(3600);
      b.add([{ x: cx + 200, y: cy - 600 }]);
      terrain.push(pts);
      return {
        name: o.name, tip: o.tip, theme: o.theme, groundTint: o.groundTint,
        physics: o.physics || {}, groundColor: o.groundColor || "#6b4f3a", groundTopColor: o.groundTopColor || "#a07e5e",
        start: { x: 0, y: -40 }, checkpoints: cp, finish: { x: finishX },
        fallLimitY: lowestY() + 800, // falling 12 m below the lowest ground = crash
        terrain: terrain, zones: zones, testRide: o.testRide || rides
      };
    }
  };
  return b;
}

// ---------------- THE LEVELS, in play order ----------------
var LEVELS = [
  // ---------------- LEVEL 1: SKULL HOLLOW (tutorial, normal physics) ----------------
  // About 420 m, 35-45 s. Rolling hills, two tabletops, a short hill, rollers and a
  // small double, all with long, forgiving downhill landings (good up to ~85 km/h),
  // and a checkpoint before every jump.
  // testRide = how the automated test rider (tests/ride-levels.js) rides it: from each
  // x it aims for that speed (km/h).
  (function () {
        var L = LevelBuilder();
        var lastCp = 0;
        function cp() { L.flat(260); L.checkpoint(); L.flat(260); lastCp = L.x(); }
        function bcp() { if (L.x() - lastCp > 5000) cp(); else L.flat(400); }
        function due(gap) { if (L.x() - lastCp > (gap || 14000)) cp(); }   // a checkpoint about every 250 m, always before a feature
        // climb back up after a landing so the track keeps its height
        function climb() {
          var dy = Math.min(2600, L.y() - 400);
          if (dy > 200) { L.bump(Math.round(dy * 6), -dy); L.flat(400); }
        }
        // calm rolling ground between features
        function calm(len, h) { due(16000); L.hills(len, h || 26, 800); L.flat(300); }
        // small tabletop (lip under 70 px): gentle long landing
        function tab(h, top) {
          due();
          L.table(Math.round(h * 7.6 + 80), -h, top || 640, Math.round(h * 36), Math.round(h * 8.4), Math.round(h * 13), Math.round(h * 1.4));
        }
        // small double of the rhythm kind (lip under 70 px)
        function small(k) {
          L.lip(480 * k, -62 * k); L.ramp(100, 30 * k); L.flat(90 * k); L.ramp(100, -34 * k); L.ramp(60, 8); L.ramp(260 * k, 64 * k); L.ease(200, 22);
          L.flat(160);
        }
        // steep landing, then a climb back up
        function land(deg) { L.steep(deg); L.flat(500); climb(); }
        // BIG jumps (lip 70-90 px) land on a steep downhill; checkpoint first
        function tabS(h, top, deg) { bcp(); L.lip(Math.round(h * 7.6 + 80), -h); L.flat(top || 640); land(deg); }
        function dblS(h, gap, deg) { bcp(); L.lip(Math.round(h * 7 + 40), -h); L.flat(120 + gap * 2); land(deg); }
        function stepS(h, deg) { bcp(); L.lip(Math.round(h * 6), -h); L.flat(500); land(deg); }
        function hill(w, h) { due(); L.bump(w, -h); L.flat(260); L.bump(w, h); L.flat(260); }
  
        L.speed(45);
        // ---- CHAPTER 1: start straight, rollers, first tabletops, whoops ----
        L.flat(1300);                                     // lean forward first, then open the throttle
        L.hills(1600, 29, 800); L.flat(200);
        tab(58, 600); L.flat(300);
        calm(1800);
        L.whoops(8, 240, 18); L.flat(300);
        calm(2000);
        L.bump(1400, -180); L.flat(300); L.bump(1400, 180); L.flat(300);   // short hill
        cp();
        calm(1800);
        tab(66, 640); L.flat(300);
        calm(2000);
        L.whoops(10, 240, 20); L.flat(300);
        calm(2000);
        tabS(76, 640, 45);
        calm(1800);
        hill(1800, 220);
        calm(1800);
        cp();
        // ---- freestyle ramp 1 (the middle) ----
        L.freestyle(1);
        L.flat(700); climb();
        // ---- CHAPTER 2: rhythm and whoops ----
        calm(1800);
        L.whoops(12, 240, 22); L.flat(300);
        calm(2000);
        due();
        small(1); small(1.05); small(1.1);
        L.flat(300);
        calm(1800);
        dblS(80, 130, 45);
        calm(1800);
        L.whoops(10, 260, 22); L.flat(300);
        calm(2000);
        stepS(80, 45);
        calm(1800);
        // ---- CHAPTER 3: hills ----
        hill(2200, 240);
        calm(1800);
        tabS(84, 660, 50);
        calm(2000);
        L.whoops(14, 240, 24); L.flat(300);
        calm(2000);
        hill(2400, 250);
        calm(1800);
        dblS(86, 150, 50);
        calm(1800);
        L.whoops(10, 260, 22); L.flat(300);
        calm(1800);
        cp();
        // ---- freestyle ramp 2: the finale ----
        L.freestyle(1);
        L.flat(400);
        return L.build({
          name: "Level 1 - Skull Hollow",
          tip: "Tip: hold RIGHT (lean forward) for a moment BEFORE you press UP, or the bike flips back",
          theme: {
            kind: "skull", sky: ["#0b0a1a", "#2a1a3a", "#4a2a4a"], stars: 0.7,
            body: { kind: "moon", x: 0.78, y: 0.2, r: 46, color: "#e8e4c8", glow: "rgba(255,250,200,0.25)" },
            hills: [[0.12, "#241a33", 0.62, 90], [0.25, "#1a1226", 0.74, 70]],
            propColor: "#cfc9b0", propColor2: "#3a2a2a", density: 0.6
          },
        });
      })(),

  // ---------------- LEVEL 2: PUMPKIN PATCH (bouncy pumpkin trampolines) ----------------
  // Whoops, tabletops, doubles, then pumpkin trampolines: land on a patch and you are
  // thrown back up (BOING). Ride the bounces level and carry your speed to the next jump.
  // The freestyle ramp is the finale.
  (function () {
        var L = LevelBuilder();
        var lastCp = -4000;
        // Calm rolling ground between features; drops a checkpoint when the last one is far behind.
        function calm(len, h) {
          L.hills(Math.round(len / 800) * 800, h || 24, 800); L.flat(300);
          if (L.x() - lastCp > 15500) { L.flat(250); L.checkpoint(); lastCp = L.x(); L.flat(250); }
        }
        // A checkpoint BEFORE every big jump, then a short run-up
        function bigCp() { if (L.x() - lastCp > 2500) { L.flat(250); L.checkpoint(); lastCp = L.x(); L.flat(250); } L.flat(300); }
        // Climb back up (gentle uphill) so the level never ends far below its start
        function climb(dy) { dy = Math.round(dy * 0.55); if (dy < 100) return; L.bump(dy * 5, -dy); L.flat(400); }
        // Flat run-out after a steep landing, then the climb back
        function runOut(dy) { L.flat(600); climb(dy); }
        // Small tabletop (lip under 70 px) with the gentle long landing
        function smallTable(h) {
          var k = h - 62;
          L.table(600 + k * 6, -h, 640 + k * 6, 2300 + k * 30, 560 + k * 5, 900 + k * 6, 100 + k * 0.5);
        }
        // Rhythm: n small doubles in a row
        function rhythm(n, s) {
          for (var i = 0; i < n; i++) {
            var q = s * (1 + 0.12 * i);
            L.lip(480 * q, -62 * q); L.ramp(100 * q, 30 * q); L.flat(90 * q); L.ramp(100 * q, -34 * q);
            L.ramp(60, 8); L.ramp(260 * q, 64 * q); L.ease(200 * q, 22 * q);
            L.flat(160 * q);
          }
        }
        // BIG tabletop (lip 72-90) on a steep landing
        function bigTable(h, deg, back) {
          var k = h - 62;
          bigCp();
          L.lip(600 + k * 6, -h); L.flat(640 + k * 6); L.ramp(80, h * 0.17);
          L.steep(deg); runOut(back);
        }
        // BIG double on a steep landing
        function bigDouble(h, deg, back) {
          var k = h - 70;
          bigCp();
          L.lip(560 + k * 7, -h); L.ramp(100, h * 0.43); L.flat(100); L.ramp(110, -h * 0.57);
          L.steep(deg); runOut(back);
        }
        // BIG triple on a steep landing
        function bigTriple(h, deg, back) {
          bigCp();
          L.lip(540 + h * 2, -h);
          for (var i = 0; i < 3; i++) { L.ramp(280, h * 0.45); L.flat(60); L.ramp(400, -h * 0.5); L.flat(i < 2 ? 140 : 40); }
          L.steep(deg); runOut(back);
        }
        // Hill with a flat top (h up to 250 px)
        function hill(h, len, top) { L.bump(len, -h); L.flat(top || 400); L.bump(len, h); L.flat(300); }
        // Pumpkin patch: a jump onto a long flat zone of trampolines
        function patch(label, bounce, h, w) {
          L.speed(45);
          L.lip(560 + h * 1.2, -h); L.ramp(h * 2, h * 0.5); L.flat(120);
          L.pad(w, label, bounce); L.flat(w);
        }
        function freestyle() { bigCp(); L.freestyle(1); runOut(3000); }
  
        L.speed(45);
        // ===== CHAPTER 1: warm-up (start straight, rollers, whoops, tabletop, first patch) =====
        L.flat(1300);
        calm(1600);
        L.whoops(8, 240, 18); calm(1600);
        smallTable(66); calm(1600);
        patch("PUMPKIN PATCH", 0.8, 80, 2200); L.speed(48); calm(2400);
        rhythm(3, 0.9); calm(1600);
        L.whoops(10, 240, 20); calm(1600);
        hill(200, 1800, 300); calm(1600);
  
        // ===== CHAPTER 2: first big jumps =====
        L.speed(48);
        bigTable(76, 45, 2800); calm(1600);
        L.whoops(12, 240, 22); calm(2400);
        bigDouble(80, 45, 2800); calm(2400);
        hill(240, 2200, 300); calm(1600);
        freestyle(); calm(1600);                                              // freestyle 1 (the middle)
  
        // ===== CHAPTER 3: patch, rhythm, tabletops =====
        L.speed(50);
        patch("BIG BOUNCE", 0.85, 85, 2300); L.speed(50); calm(2400);
        L.whoops(14, 240, 24); calm(1600);
        bigTable(86, 50, 2800); calm(2400);
        rhythm(3, 0.95); calm(1600);
        hill(230, 2000, 300); calm(1600);
        bigTriple(80, 50, 2800); calm(2400);
  
        // ===== CHAPTER 4: the finish =====
        L.speed(50);
        L.whoops(10, 240, 22); calm(2400);
        patch("GREAT PUMPKIN", 0.85, 85, 2400); L.speed(50); calm(1600);
        bigDouble(86, 50, 2800); calm(2400);
        bigTable(90, 55, 2800); calm(2400);
        freestyle();                                                          // freestyle 2: the finale
        L.flat(400);
        return L.build({
          name: "Level 2 - Pumpkin Patch",
          tip: "Tip: pumpkins are trampolines. Land level and keep the throttle gentle",
          groundColor: "#5a3a22", groundTopColor: "#b86a1c", groundTint: "rgba(120,50,0,0.25)",
          theme: {
            kind: "pumpkin", sky: ["#1a0a1f", "#4a1a2a", "#a2481c"], stars: 0.3,
            body: { kind: "blood", x: 0.75, y: 0.22, r: 58, color: "#ff9a3a", glow: "rgba(255,150,50,0.3)" },
            hills: [[0.12, "#3a1a28", 0.64, 90], [0.25, "#2a1220", 0.76, 70]],
            propColor: "#ff8a1f", propColor2: "#2d4a1f", density: 0.55
          }
        });
      })(),

  // ---------------- LEVEL 3: MOON CRATER (low gravity) ----------------
  // Gravity is 40%: everything is floaty. Jumps carry about 2.5 times as far, so the
  // take-offs are small and the landings are very long.
  (function () {
        var L = LevelBuilder({ landScale: 1.5 });
        var lastCp = -20000;
        // --- helpers (all private to this level) ---
        function cp(pre, post) { L.flat(pre === undefined ? 300 : pre); L.checkpoint(); L.flat(post === undefined ? 300 : post); lastCp = L.x(); }
        function due() { if (L.x() - lastCp > 15000) cp(); }            // a checkpoint about every 250-300 m, always before a feature
        function big() { if (L.x() - lastCp > 800) cp(300, 300); }      // a checkpoint right before every big jump
        function calm(len) { due(); L.hills(len, 40, 1200); L.flat(200); }     // calm rolling ground between features
        // small tabletop (lip under 70 px): lip, flat top, then the gentle old-style long landing
        function tableJ(h, top) {
          due();
          L.lip(560 + h * 1.2, -h); L.flat(top); L.ramp(80, h * 0.17); L.ramp(3600, 450); L.ease(1400, 100);
        }
        // small double: lip of h px, gap of `gap` px of flat, then a long gentle landing
        function doubleJ(h, gap) {
          due();
          L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(gap); L.ramp(220, -h * 0.75);
          L.ramp(80, 10); L.ramp(3600, 430); L.ease(1400, 100);
        }
        // calm uphill (about 15 percent) in short straight pieces: gives back the height the landings take
        function up(len) {
          var n = Math.max(1, Math.round(len / 2200)), i;
          for (i = 0; i < n; i++) { L.ramp(len / n, -len / n * 0.15); L.flat(250); due(); }
        }
        // BIG tabletop: lip, flat top, then straight onto a steep landing, then a run-out
        function steepTable(h, top, deg) {
          big(); L.lip(560 + h * 1.2, -h); L.flat(top); L.steep(deg, 0); L.flat(700);
        }
        // BIG double: lip, gap, face, then the steep landing right behind the face
        function steepDouble(h, gap, deg) {
          big(); L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(gap); L.ramp(220, -h * 0.75);
          L.ramp(80, 10); L.steep(deg, 0); L.flat(700);
        }
        function stepUp(dy) { L.bump(900, -dy); L.flat(500); }
        // crater hill: climb dy px, a plateau, then the way down
        function hill(dy, run, top) { due(); L.bump(run, -dy); L.flat(top); L.bump(run * 1.1, dy); L.flat(400); }
        // freestyle ramp with extra flat run-up so the rider has reached the 78 km/h take-off speed
        function freestyle(gap) { L.speed(78, false, undefined, true); L.flat(2500); L.freestyle(gap); }
        L.speed(45);
        // ===== CHAPTER 1: start straight, lunar whoops, a tabletop, crater rollers =====
        L.flat(1500);
        L.whoops(8, 360, 40); calm(1800);
        tableJ(60, 900); calm(2000);
        stepUp(100); calm(1800);
        doubleJ(60, 360); calm(2000);
        L.whoops(10, 380, 46); calm(1800);
        hill(200, 1800, 600); calm(1200);
  
        // ===== CHAPTER 2: whoops, the first big tabletop, climbs =====
        L.whoops(12, 380, 48); calm(2200);
        steepTable(80, 1000, 45); up(12000);
        tableJ(65, 900); calm(1800);
        stepUp(150); calm(1800);
        hill(250, 2200, 700); calm(1800);
        doubleJ(65, 380); calm(2000);
        L.whoops(10, 380, 46); calm(1800);
        big(); freestyle(2.2); L.flat(800);                     // freestyle 1: the middle
        up(12000);
  
        // ===== CHAPTER 3: crater hills =====
        hill(220, 2000, 600); calm(1800);
        steepDouble(85, 450, 50); up(12000);
        tableJ(70, 900); calm(1800);
        L.whoops(12, 400, 52); calm(2200);
        steepTable(90, 1000, 50); up(12000);
  
        // ===== CHAPTER 4: the finale =====
        stepUp(150); calm(1800);
        hill(250, 2200, 700); calm(1000);
        big(); freestyle(2.5);                                  // freestyle 2: the finale
        up(8000);
        L.flat(400);
        return L.build({
          name: "Level 3 - Moon Crater",
          tip: "Tip: low gravity. Jumps fly far, so take off slow and land level",
          physics: { gravityScale: 0.4 },
          groundColor: "#4a4a58", groundTopColor: "#b8b8c8", groundTint: "rgba(140,140,170,0.25)",
          theme: {
            kind: "moon", sky: ["#02030a", "#080d22", "#1a2040"], stars: 1,
            body: { kind: "earth", x: 0.78, y: 0.22, r: 54, color: "#2a5aa0", glow: "rgba(120,170,255,0.3)" },
            hills: [[0.1, "#262a3e", 0.68, 80], [0.22, "#1a1d2e", 0.78, 60]],
            propColor: "#8a8aa0", propColor2: "#5a5a70", density: 0.45
          }
        });
      })(),

  // ---------------- LEVEL 4: BAT CAVE (loop-the-loops) ----------------
  // The hardest one: the cave has loop-the-loops. You need speed to get over the top
  // (about 60 km/h or more); too slow and you fall off the wall. In between: whoops,
  // a rhythm section, tabletops and the freestyle ramp.
  (function () {
        var L = LevelBuilder();
        var lastCp = 0;
        function chk(min) { // checkpoint on level ground when the last one is far behind
          if (L.x() - lastCp > (min || 16000)) { L.flat(250); L.checkpoint(); L.flat(250); lastCp = L.x(); }
        }
        function chkBig() { chk(3500); L.flat(300); } // always a checkpoint close before a big jump
        function calm(len, h) { L.hills(len, h || 26, 800); L.flat(300); } // calm rolling ground (len = multiple of 800)
        function tbl(h) {                        // tabletop with the gentle long landing, h = lip height in px
          L.table(Math.round(7.5 * h + 100), -h, 640 + (h - 66) * 3, Math.round(38 * h), Math.round(9.5 * h), Math.round(14 * h), Math.round(1.6 * h));
        }
        function dbl(h) {                        // double jump with the gentle long landing
          var k = h / 80;
          L.lip(Math.round(600 + (k - 1) * 300), -h); L.ramp(Math.round(120 * k), Math.round(50 * k)); L.flat(Math.round(110 * k));
          L.ramp(Math.round(110 * k), Math.round(-45 * k)); L.ramp(80, 10); L.ramp(Math.round(1800 * k), Math.round(420 * k)); L.ease(Math.round(900 * k), Math.round(90 * k));
        }
        function land(deg) {                     // steep landing, flat, then a long gentle climb back up
          L.steep(deg); L.flat(400); L.bump(6400, -1700); L.flat(300);
        }
        function tblS(h, deg) {                  // big tabletop with a steep landing
          chkBig();
          L.lip(Math.round(7.5 * h + 100), -h); L.flat(640 + (h - 66) * 3); land(deg);
        }
        function dblS(h, deg) {                  // big double with a steep landing
          var k = h / 80;
          chkBig();
          L.lip(Math.round(600 + (k - 1) * 300), -h); L.ramp(Math.round(120 * k), Math.round(50 * k)); L.flat(Math.round(110 * k));
          land(deg);
        }
        function rhythm(n, s, gap) {             // n small doubles in a row, each a bit bigger
          for (var i = 0; i < n; i++) {
            var k = s + 0.08 * i;
            L.lip(Math.round(480 * k), Math.round(-62 * k)); L.ramp(Math.round(100 * k), Math.round(30 * k)); L.flat(Math.round(90 * k));
            L.ramp(Math.round(100 * k), Math.round(-34 * k)); L.ramp(60, 8); L.ramp(Math.round(260 * k), Math.round(64 * k)); L.ease(Math.round(200 * k), Math.round(22 * k));
            L.flat(gap);
          }
        }
        function bigLoop(after) {                // 2000 px of flat before the loop, a long flat after it
          chk(9000); L.flat(300);
          L.speed(60); L.flat(2000);
          L.loop(320);
          L.speed(50); L.flat(after || 1500);
        }
        function hill(h, len) { L.bump(len, -h); L.flat(300); L.bump(len, h); L.flat(300); }
        function freeCalm() { L.flat(600); }     // flat ground after a freestyle landing
        L.speed(50);
  
        // ---- Chapter 1: start straight, rollers, first tabletop, whoops, loop 1 ----
        L.flat(1300);
        calm(1600, 29);
        chk(); tbl(60); calm(1600);
        L.whoops(8, 240, 18); calm(1600);
        hill(200, 1800); calm(1600);
        bigLoop();                                                  // loop 1
        calm(1600);
        chk(); dbl(80); calm(1600);
        L.whoops(10, 240, 20); calm(1600);
        tblS(90, 45); calm(1600);
        chk(); rhythm(3, 1.0, 200); calm(1600);
  
        // ---- Chapter 2: hills, loop 2, doubles, the middle freestyle ----
        hill(230, 1800); calm(1600);
        bigLoop(1600);                                              // loop 2 (1600 flat after it)
        calm(1600);
        L.whoops(12, 240, 20); calm(1600);
        dblS(85, 50); calm(1600);
        chk(); L.freestyle(1); freeCalm(); calm(1600);              // freestyle 1 (the middle)
  
        // ---- Chapter 3: whoops, tabletops, loop 3 ----
        L.whoops(10, 240, 20); calm(1600);
        tblS(90, 50); calm(1600);
        bigLoop();                                                  // loop 3
        calm(1600);
        L.whoops(12, 240, 22); calm(1600);
        dblS(90, 50); calm(1600);
        chk(); rhythm(4, 1.0, 200); calm(1600);
  
        // ---- Chapter 4: the finale ----
        tblS(90, 55); calm(1600);
        chk(); L.whoops(14, 240, 22); calm(1600);
        dblS(90, 50); calm(1600);
        tblS(90, 55); calm(1600);
        chk(); L.freestyle(1); L.flat(400);                         // freestyle 2: the finale
        return L.build({
          name: "Level 4 - Bat Cave",
          tip: "Tip: loops need speed. Hold the throttle through the whole loop",
          groundColor: "#2a2433", groundTopColor: "#6a5a80", groundTint: "rgba(60,40,90,0.3)",
          theme: {
            kind: "bat", sky: ["#05030c", "#150a24", "#2a1238"], stars: 0.2,
            hills: [[0.12, "#1c1230", 0.66, 90], [0.25, "#120a22", 0.78, 70]],
            propColor: "#3a2a50", propColor2: "#7a5aa0", density: 0.5
          }
        });
      })()
];
