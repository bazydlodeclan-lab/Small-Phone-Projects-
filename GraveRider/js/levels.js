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
function LevelBuilder() {
  var pts = [{ x: -600, y: 0 }], cp = [], zones = [], terrain = [], loops = 0, rides = [];
  var cx = -600, cy = 0;
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
      b.flat(1500 * gap);
      b.add(Shapes.curve(cx, cy, cx + 320, cy - 120, 10)); // landing ramp face (about 20 deg, rideable)
      b.flat(60);
      b.add(Shapes.curve(cx, cy, cx + 1100 * gap + 700, cy + 120, 24)); // long downhill landing
      b.flat(300);
      b.speed(before);
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
        fallLimitY: cy + 800, terrain: terrain, zones: zones, testRide: o.testRide || rides
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
    L.speed(45);
    L.flat(1300);                                   // start straight: lean forward first, then open the throttle
    L.hills(1600, 29, 800);                         // gentle rollers
    L.flat(200);
    L.table(560, -58, 600, 2200, 550, 900, 100);    // tabletop 1 (0.9 m): lands on a 14 deg downhill
    L.flat(300); L.checkpoint(); L.flat(300);
    L.whoops(8, 240, 18); L.flat(300);              // whoops
    L.bump(1400, -180); L.flat(300); L.bump(1400, 180); // short hill
    L.flat(200); L.checkpoint();
    L.hills(1600, 26, 800);                         // rollers (0.4 m)
    L.flat(200); L.bump(1000, 160);                 // easy downhill
    L.bump(1300, -160); L.flat(300); L.checkpoint(); L.flat(300);   // gentle climb
    L.table(540, -77, 640, 2800, 700, 1000, 125);   // tabletop 2 (1.2 m)
    L.flat(300); L.checkpoint(); L.flat(500);
    L.lip(660, -96); L.ramp(120, 50); L.flat(106); L.ramp(107, -45); // small double: 1.5 m lip, 5 m gap
    L.ramp(80, 10); L.ramp(2400, 600); L.ease(1000, 100);           // long 14 deg landing
    L.flat(400); L.checkpoint(); L.flat(400);
    for (var i = 0; i < 3; i++) {                   // rhythm section: three small doubles in a row
      L.lip(480, -62); L.ramp(100, 30); L.flat(90); L.ramp(100, -34); L.ramp(60, 8); L.ramp(260, 64); L.ease(200, 22);
      L.flat(160);
    }
    L.flat(300); L.checkpoint(); L.flat(300);
    L.whoops(12, 240, 20); L.flat(400);              // long whoops section
    L.bump(1600, -200); L.flat(300); L.bump(1600, 200); L.flat(300);   // hill
    L.checkpoint(); L.flat(300);
    L.table(600, -70, 640, 2600, 640, 950, 110);    // tabletop 3 (1.1 m)
    L.flat(400); L.checkpoint(); L.flat(400);
    L.hills(1600, 26, 800); L.flat(300);
    L.freestyle(1);                                 // freestyle ramp: the backflip jump
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
    L.speed(45);
    L.flat(1300);
    L.whoops(8, 240, 18); L.flat(300); L.checkpoint(); L.flat(300);          // whoops: 3.75 m apart
    L.table(600, -62, 640, 2300, 560, 900, 100);                               // tabletop (1 m)
    L.flat(300); L.checkpoint(); L.flat(300);
    L.lip(620, -80);                                                           // jump 1 (1.25 m) onto the first patch
    L.ramp(160, 40); L.flat(120);
    L.pad(2200, "PUMPKIN PATCH", 0.8); L.flat(2200);                           // trampoline patch
    L.flat(200); L.checkpoint(); L.flat(300);
    L.hills(1600, 22, 800);                                                    // rollers
    L.flat(300);
    L.lip(560, -70); L.ramp(100, 30); L.flat(100); L.ramp(110, -40);          // double (1.1 m lip)
    L.ramp(80, 10); L.ramp(1600, 380); L.ease(800, 80);                        // landing downhill
    L.flat(300); L.checkpoint(); L.flat(300);
    L.whoops(10, 240, 20); L.flat(400);                                        // more whoops
    for (var i = 0; i < 3; i++) {                                              // rhythm section: three small doubles
      L.lip(480, -62); L.ramp(100, 30); L.flat(90); L.ramp(100, -34); L.ramp(60, 8); L.ramp(260, 64); L.ease(200, 22);
      L.flat(160);
    }
    L.flat(300); L.checkpoint(); L.flat(300);
    L.lip(620, -90);                                                           // jump 2 onto the second patch
    L.ramp(160, 60); L.flat(120);
    L.pad(2400, "BIG BOUNCE", 0.85); L.flat(2400);
    L.flat(300); L.checkpoint(); L.flat(300);
    L.whoops(12, 240, 20); L.flat(400);                                        // long whoops section
    L.bump(1600, -200); L.flat(300); L.bump(1600, 200); L.flat(300);           // hill
    L.checkpoint(); L.flat(300);
    L.table(560, -70, 640, 2400, 600, 900, 100);                               // last tabletop
    L.flat(400); L.checkpoint(); L.flat(400);
    L.hills(1600, 24, 800); L.flat(300);
    L.freestyle(1);                                                            // freestyle ramp: the backflip jump
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
    var L = LevelBuilder();
    L.speed(45);
    L.flat(1300);
    L.whoops(6, 360, 40); L.flat(400); L.checkpoint(); L.flat(300);             // lunar whoops: big, slow bumps
    L.table(600, -50, 900, 3600, 700, 1400, 130);                                // low tabletop, very long landing
    L.flat(300); L.checkpoint(); L.flat(300);
    L.hills(2400, 40, 1200);                                                     // crater rollers
    L.flat(300);
    L.lip(620, -60); L.ramp(200, 90); L.flat(360); L.ramp(240, -70);            // double (long gap in low gravity)
    L.ramp(80, 10); L.ramp(3600, 700); L.ease(1400, 130);
    L.flat(300); L.checkpoint(); L.flat(400);
    L.whoops(8, 360, 44); L.flat(400);
    L.lip(560, -50); L.ramp(100, 40); L.flat(240); L.ramp(200, -50);            // second double
    L.ramp(80, 10); L.ramp(3800, 800); L.ease(1400, 140);
    L.flat(300); L.checkpoint(); L.flat(300);
    L.hills(2400, 40, 1200); L.flat(300);
    L.table(600, -50, 900, 3600, 700, 1400, 130);
    L.flat(300); L.checkpoint(); L.flat(300);
    L.whoops(8, 360, 44); L.flat(400);
    L.hills(2400, 40, 1200); L.flat(300);
    L.freestyle(2.2);                                                            // freestyle ramp (long, for low gravity)
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
    L.speed(50);
    L.flat(1300);
    L.whoops(6, 240, 18); L.flat(300); L.checkpoint(); L.flat(300);
    L.table(600, -66, 640, 2400, 600, 900, 100);
    L.flat(300); L.checkpoint(); L.flat(400);
    L.loop(320); L.flat(400);                                                   // loop 1
    L.flat(200); L.checkpoint(); L.flat(300);
    L.lip(600, -80); L.ramp(120, 50); L.flat(110); L.ramp(110, -45);           // double
    L.ramp(80, 10); L.ramp(1800, 420); L.ease(900, 90);
    L.flat(400); L.checkpoint(); L.flat(300);
    L.whoops(10, 240, 20); L.flat(400);
    for (var i = 0; i < 3; i++) {                                               // rhythm section
      L.lip(480, -62); L.ramp(100, 30); L.flat(90); L.ramp(100, -34); L.ramp(60, 8); L.ramp(260, 64); L.ease(200, 22);
      L.flat(160);
    }
    L.flat(300); L.checkpoint(); L.flat(300);
    L.loop(320); L.flat(400);                                                   // loop 2
    L.flat(300); L.checkpoint(); L.flat(300);
    L.flat(1000); L.whoops(12, 240, 20); L.flat(400);
    L.bump(1600, -200); L.flat(300); L.bump(1600, 200); L.flat(300);
    L.checkpoint(); L.flat(300);
    L.table(580, -76, 640, 2600, 640, 900, 110);
    L.flat(400); L.checkpoint(); L.flat(400);
    L.hills(1600, 24, 800); L.flat(300);
    L.freestyle(1);                                                             // freestyle ramp
    L.flat(400);
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
