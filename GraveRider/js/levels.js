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
      b.steep(50, 1500 * gap);                          // steep landing: the bike lands on a 50 degree downhill
      b.flat(300);
      b.speed(before);
    },
    // Landing zone (owner request: big jumps land on a steep 45-70 degree downhill that then
    // rounds out gradually, like a real motocross landing, and it must be where you ACTUALLY
    // land, also for riders who hold the throttle and fly 70-90 m). Three parts, all smooth:
    //  1. head (about 22 m): starts at `deg` degrees right at the crest and eases to a gentle 11 degrees
    //  2. tail (about 75 m): a long gentle downhill where the fast flyers come down
    //  3. round-out (about 28 m): flattens smoothly to level ground
    // About 30-36 m of height is lost in all (more for steeper starts). Put it right after
    // the gap or top of a jump. (The old `drop` argument is no longer used.)
    steep: function (deg) {
      var s0 = Math.tan(deg * Math.PI / 180), sT = 0.2, H = 1400, T = 4800, R = 1800, pts2 = [], x = cx, y = cy, i, n = 20;
      for (i = 1; i <= n; i++) { // head: slope eases from s0 down to sT
        var u = i / n, sl = sT + (s0 - sT) * (1 - u) * (1 - u);
        x += H / n; y += sl * H / n; pts2.push({ x: x, y: y });
      }
      x += T; y += sT * T; pts2.push({ x: x, y: y }); // tail (straight, gentle)
      for (i = 1; i <= n; i++) { // round-out: slope eases from sT down to 0
        var v = i / n, sr = sT * (1 - v) * (1 - v);
        x += R / n; y += sr * R / n; pts2.push({ x: x, y: y });
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
      function due(gap) { if (L.x() - lastCp > (gap || 13000)) cp(); }   // a checkpoint every ~250-300 m, always before a feature
      // tabletop: h = lip height (px), long downhill landing in proportion
      function tab(h, top) {
        due();
        L.table(Math.round(h * 7.6 + 80), -h, top || 640, Math.round(h * 36), Math.round(h * 8.4), Math.round(h * 13), Math.round(h * 1.4));
      }
      // double: lip h, gap g (px of flat), long landing
      function dbl(h, gap) {
        L.lip(Math.round(h * 7 + 40), -h); L.ramp(120, Math.round(h * 0.5)); L.flat(gap); L.ramp(Math.round(h * 1.1), -Math.round(h * 0.47));
        L.ramp(80, 10); L.ramp(Math.round(h * 26), Math.round(h * 6.2)); L.ease(Math.round(h * 11), Math.round(h * 1.1));
      }
      // small double of the rhythm kind (the proven shape), scaled a little
      function small(k) {
        L.lip(480 * k, -62 * k); L.ramp(100, 30 * k); L.flat(90 * k); L.ramp(100, -34 * k); L.ramp(60, 8); L.ramp(260 * k, 64 * k); L.ease(200, 22);
        L.flat(160);
      }
      // step-up / step-down: climb a ramp onto a raised top, then roll off and land long
      function step(h) {
        due();
        L.lip(Math.round(h * 6), -h); L.flat(500); L.ramp(80, Math.round(h * 0.2));
        L.ramp(Math.round(h * 24), Math.round(h * 5.2)); L.ease(Math.round(h * 9), Math.round(h * 1.0));
      }
      // steep landing: a run-out after it, then a climb back up so the track keeps its height
      function land(deg, drop) {
        L.steep(deg, drop); L.flat(600); L.bump(Math.round(drop * 1.8), -Math.round(drop * 0.4)); L.flat(200);
      }
      // BIG jumps land on a steep downhill (45-70 degrees)
      function tabS(h, top, deg, drop) {
        due();
        L.lip(Math.round(h * 7.6 + 80), -h); L.flat(top || 640); land(deg, drop);
      }
      function dblS(h, gap, deg, drop) {
        due();
        L.lip(Math.round(h * 7 + 40), -h); L.flat(120 + gap * 2); land(deg, drop);
      }
      function stepS(h, deg, drop) {
        due();
        L.lip(Math.round(h * 6), -h); L.flat(500); land(deg, drop);
      }
      function hill(w, h) { due(); L.bump(w, -h); L.flat(260); L.bump(w, h); L.flat(260); }
  
      L.speed(45);
      // ---- CHAPTER 1: start straight, rollers, first tabletops, first whoops ----
      L.flat(1300);                                     // lean forward first, then open the throttle
      L.hills(1600, 29, 800); L.flat(200);
      tab(58, 600); L.flat(300);
      L.whoops(8, 240, 18); L.flat(300);
      L.bump(1400, -180); L.flat(300); L.bump(1400, 180);   // short hill
      L.flat(300); cp();
      L.hills(1600, 26, 800); L.flat(200);
      tab(77, 640); L.flat(300);
      L.whoops(10, 240, 20); L.flat(300);
      hill(1800, 220);
      cp();
      L.freestyle(1);                                   // freestyle ramp 1
      L.flat(500);
  
      // ---- CHAPTER 2: whoops chapter ----
      due();
      L.whoops(14, 240, 22); L.flat(500);               // long whoops
      step(80); L.flat(400);
      L.hills(2000, 30, 1000); L.flat(300);
      due();
      L.whoops(18, 240, 24); L.flat(500);               // the big whoops section
      tabS(90, 640, 45, 1300); L.flat(400);
      L.whoops(8, 280, 26); L.flat(300);
      hill(2200, 280);
      L.hills(1600, 26, 800); L.flat(300);
      cp();
      L.freestyle(1);                                   // freestyle ramp 2
      L.flat(500);
  
      // ---- CHAPTER 3: rhythm chapter ----
      due();
      L.hills(1600, 28, 800); L.flat(300);
      cp();
      small(1); small(1); small(1.1); small(1.2);       // rhythm: doubles in a row
      L.flat(300);
      due(); dbl(80, 120); L.flat(400);
      dblS(96, 150, 45, 1300); L.flat(400);
      tabS(100, 700, 45, 1300); L.flat(400);
      cp();
      small(1); small(1.2); small(1.3);                 // triple-ish rhythm
      L.flat(300);
      dblS(110, 190, 50, 1400); L.flat(500);
      L.whoops(12, 240, 22); L.flat(400);
      stepS(100, 50, 1400); L.flat(400);
      tabS(110, 700, 50, 1400); L.flat(400);
      L.hills(2000, 32, 1000); L.flat(300);
      due(); L.whoops(10, 260, 24); L.flat(400);
      dblS(90, 150, 45, 1300); L.flat(400);
  
      // ---- CHAPTER 4: hills chapter ----
      due();
      hill(2400, 300);
      L.hills(2000, 30, 1000); L.flat(300);
      due();
      L.bump(2600, -380); L.flat(400);                  // big hill (6 m)
      tabS(100, 700, 45, 1300);                          // a tabletop on the summit side
      L.flat(300);
      L.bump(2600, 330); L.flat(400);
      due();
      L.bump(1500, -150); L.flat(200); L.bump(1500, -150); L.flat(300);   // staircase up
      L.whoops(10, 260, 24); L.flat(300);
      cp();
      L.bump(2000, 180); L.flat(300); L.bump(2000, 150); L.flat(300);
      due();
      dblS(100, 160, 50, 1400); L.flat(400);
      hill(2800, 340);
      L.flat(200);
      cp();
      L.freestyle(1);                                   // freestyle ramp 3
      L.flat(500);
  
      // ---- CHAPTER 5: big jumps, freestyle finale ----
      due();
      L.whoops(10, 240, 22); L.flat(400);
      tabS(120, 720, 55, 1500); L.flat(400);
      due(); dblS(115, 200, 55, 1500); L.flat(400);
      stepS(120, 55, 1500); L.flat(400);
      small(1.3); small(1.3); small(1.4);
      L.flat(300);
      due(); L.hills(2400, 34, 1200); L.flat(300);
      tabS(125, 740, 60, 1600); L.flat(400);
      due();
      tabS(130, 760, 60, 1600); L.flat(400);
      L.whoops(14, 240, 24); L.flat(400);
      hill(2600, 330);
      due(); dblS(130, 220, 65, 1600); L.flat(500);
      L.hills(1600, 26, 800); L.flat(300);
      cp();
      L.freestyle(1);                                   // freestyle ramp 4: the finale
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
      // A short breather between features; drops a checkpoint when the last one is far behind.
      function gap(far) {
        L.flat(300);
        if (L.y() > 1500) climb(900);
        if (L.x() - lastCp > (far || 14000)) { L.checkpoint(); lastCp = L.x(); }
        L.flat(300);
      }
      // Climb back up after a lot of downhill landings, so the track stays near the same height.
      function climb(maxDy) {
        var dy = Math.min(maxDy, L.y() - 700);
        if (dy > 60) { L.bump(dy * 7, -dy); L.flat(300); }
      }
      // Tabletop with a lip h px high (62..130), landing scaled to match
      function tableJump(h, deg, drop) {
        var k = h - 62;
        if (!deg) { L.table(600 + k * 6, -h, 640 + k * 6, 2300 + k * 30, 560 + k * 5, 900 + k * 6, 100 + k * 0.5); return; }
        bigCheckpoint();
        L.lip(600 + k * 6, -h); L.flat(640 + k * 6); L.ramp(80, h * 0.17);
        L.steep(deg, drop); steepRunOut();
      }
      // Big jumps land on a steep downhill; a checkpoint comes before each one
      function bigCheckpoint() { if (L.x() - lastCp > 200) { L.checkpoint(); lastCp = L.x(); } L.flat(200); }
      // Flat run-out after a steep landing, then a climb back up so the level keeps its height
      function steepRunOut() {
        L.flat(800);
        var dy = L.y() - 300;
        if (dy > 60) { L.bump(dy * 3.5, -dy); }
        L.flat(400);
      }
      // Double jump with a take-off h px high
      function double(h, gapK, deg, drop) {
        var k = h - 70, g = gapK || 1;
        if (deg) bigCheckpoint();
        L.lip(560 + k * 7, -h); L.ramp(100 * g, h * 0.43); L.flat(100 * g); L.ramp(110 * g, -h * 0.57);
        if (deg) { L.steep(deg, drop); steepRunOut(); return; }
        L.ramp(80, 10); L.ramp(1600 + k * 25, 380 + k * 4); L.ease(800 + k * 6, 80 + k * 0.5);
      }
      // Rhythm section: n doubles in a row, each s times the size of the small one
      function rhythm(n, s) {
        for (var i = 0; i < n; i++) {
          var q = s * (1 + 0.12 * i);
          L.lip(480 * q, -62 * q); L.ramp(100 * q, 30 * q); L.flat(90 * q); L.ramp(100 * q, -34 * q);
          L.ramp(60, 8); L.ramp(260 * q, 64 * q); L.ease(200 * q, 22 * q);
          L.flat(160 * q);
        }
      }
      // A triple: three pillars in a row, then a long landing
      function triple(h, deg, drop) {
        if (deg) bigCheckpoint();
        L.lip(540 + h * 2, -h);
        for (var i = 0; i < 3; i++) { L.ramp(280, h * 0.45); L.flat(60); L.ramp(400, -h * 0.5); L.flat(i < 2 ? 140 : 40); }
        if (deg) { L.steep(deg, drop); steepRunOut(); return; }
        L.ramp(80, 10); L.ramp(2200 + h * 10, 500 + h * 3); L.ease(900, 90);
      }
      // Hill with a flat top. h up to ~380 px (6 m); no pad is ever put on it.
      function bigHill(h, len, top) {
        L.bump(len, -h); L.flat(top || 400); L.bump(len, h);
      }
      // Pumpkin patch: a jump onto a long flat zone of trampolines
      function patch(label, bounce, h, w) {
        L.speed(45);
        L.lip(560 + h * 1.2, -h); L.ramp(h * 2, h * 0.5); L.flat(120);
        L.pad(w, label, bounce); L.flat(w);
      }
  
      L.speed(45);
      // ===== CHAPTER 1: the warm-up (start straight, whoops, tabletop, first patch) =====
      L.flat(1300);
      L.whoops(8, 240, 18); gap();
      tableJump(70); gap();
      patch("PUMPKIN PATCH", 0.8, 80, 2200); L.speed(48); gap();
      L.hills(1600, 22, 800); gap();
      double(75); gap();
      L.whoops(10, 240, 20); gap();
      rhythm(3, 1); gap();
      L.bump(1800, 140); L.flat(500); L.bump(1800, 140); gap();            // two step-downs
      climb(700);
      L.freestyle(1); gap();                                                // freestyle 1
  
      // ===== CHAPTER 2: whoops and steps =====
      L.speed(50);
      L.whoops(18, 250, 26); gap();                                         // one very long whoops section
      L.ramp(500, -110); L.flat(900); L.ramp(500, -110); L.flat(900); gap(); // step-ups
      tableJump(90, 45, 1200); gap();
      patch("BIG BOUNCE", 0.85, 90, 2300); L.speed(52); gap();
      climb(700);
      bigHill(260, 2600, 500); gap();
      rhythm(4, 1.1); gap();
      L.hills(2400, 30, 900); gap();
      double(95, 1.1, 45, 1200); gap();
      climb(700);
      L.freestyle(1); gap();                                                // freestyle 2
  
      // ===== CHAPTER 3: hills, rhythm and the triple =====
      L.speed(52);
      bigHill(330, 3000, 500); gap();
      triple(90, 50, 1300); gap();
      climb(700);
      L.whoops(14, 240, 24); gap();
      patch("GOURD BOUNCE", 0.85, 90, 2300); L.speed(54); gap();
      tableJump(110, 55, 1500); gap();
      climb(700);
      bigHill(300, 2800, 400); gap();
      rhythm(4, 1.25); gap();
      double(110, 1.2, 55, 1500); gap();
      climb(700);
      patch("SQUASH PIT", 0.85, 95, 2300); L.speed(54); gap();
      L.freestyle(1); gap();                                                // freestyle 3
  
      // ===== CHAPTER 4: the big finish =====
      L.speed(55);
      L.whoops(20, 250, 30); gap(11500);                                         // the longest whoops
      L.ramp(450, -120); L.flat(700); L.ramp(450, -120); L.flat(700); L.ramp(450, 130); L.flat(700); L.ramp(450, 120); gap(11500); // step-up, step-up, step-down, step-down
      tableJump(125, 60, 1800); gap(11500);
      climb(700);
      bigHill(380, 3200, 500); gap(11500);
      triple(105, 60, 1800); gap(11500);
      patch("HARVEST HOP", 0.85, 100, 2400); L.speed(55); gap(11500);
      rhythm(4, 1.3); gap(11500);
      climb(700);
      tableJump(130, 65, 2000); gap(11500);
      double(120, 1.25, 70, 2200); gap(11500);
      L.whoops(12, 240, 26); gap(11500);
      patch("GREAT PUMPKIN", 0.85, 105, 2400); L.speed(55); gap(11500);          // big finale patch
      L.ramp(3600, 700); L.ease(900, 100); L.flat(900); L.checkpoint(); L.flat(900); // long downhill, then a checkpoint
      L.freestyle(1);                                                       // freestyle 4: the finale
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
      // --- helpers (all private to this level) ---
      function cp(pre, post) { L.flat(pre === undefined ? 300 : pre); L.checkpoint(); L.flat(post === undefined ? 300 : post); }
      // tabletop: h = lip height in px, k = landing size factor (1 = the proven 600/3600 shape)
      function tableJ(h, top, k) {
        k = k || 1;
        L.table(560 + h * 1.2, -h, top, Math.round(3600 * k), Math.round(700 * k), Math.round(1400 * k), Math.round(130 * k));
      }
      // double: lip of h px, gap of `gap` px of flat, then a long downhill landing
      function doubleJ(h, gap, land) {
        L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(gap); L.ramp(220, -h * 0.75);
        L.ramp(80, 10); L.ramp(land, Math.round(land * 0.2)); L.ease(1400, Math.round(land * 0.036));
      }
      // run-out after a steep landing: flat, then a long climb that slows the rider and gives the height back
      function runOut(drop) { L.flat(700); L.bump(Math.round(drop * 1.8), -Math.round(drop * 0.5)); L.flat(300); }
      // BIG tabletop: lip, flat top, then straight onto a steep landing (deg degrees, drop px)
      function steepTable(h, top, deg, drop) {
        L.lip(560 + h * 1.2, -h); L.flat(top); L.steep(deg, drop); runOut(drop);
      }
      // BIG double: lip, gap, face, then the steep landing right behind the face
      function steepDouble(h, gap, deg, drop) {
        L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(gap); L.ramp(220, -h * 0.75);
        L.ramp(80, 10); L.steep(deg, drop); runOut(drop);
      }
      // BIG triple: three gaps, then the steep landing
      function steepTriple(h, deg, drop) {
        L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(300); L.ramp(220, -h * 0.5);
        L.ramp(80, 5); L.flat(300); L.ramp(220, -h * 0.5); L.ramp(80, 5); L.flat(300); L.ramp(220, -h * 0.5);
        L.ramp(80, 10); L.steep(deg, drop); runOut(drop);
      }
      // step-up: climb a ledge and ride on; step-down: a long smooth drop
      function stepUp(dy) { L.bump(900, -dy); L.flat(500); }
      function stepDown(dy) { L.bump(1300, dy); L.flat(500); }
      // crater hill: climb dy px, a plateau, then the way down
      function hill(dy, run, top) { L.bump(run, -dy); L.flat(top); L.bump(run * 1.1, dy); L.flat(400); }
      // rhythm: n doubles of growing size
      function rhythm(sizes) {
        sizes.forEach(function (h) { doubleJ(h, 300 + h * 2, 1900 + h * 12); L.flat(500); });
      }
      // triple: three lips' worth of gap in a row, then a long landing
      function triple(h) {
        L.lip(540 + h * 1.3, -h); L.ramp(160, h * 0.9); L.flat(300); L.ramp(220, -h * 0.5);
        L.ramp(80, 5); L.flat(300); L.ramp(220, -h * 0.5); L.ramp(80, 5); L.flat(300); L.ramp(220, -h * 0.5);
        L.ramp(80, 10); L.ramp(4200, 900); L.ease(1600, 150);
      }
      L.speed(45);
  
      // ===== CHAPTER 1: first laps. Start straight, lunar whoops, a tabletop, crater rollers =====
      L.flat(1500);
      L.whoops(8, 360, 40); cp(400, 300);
      tableJ(60, 900, 1); cp();
      L.hills(2400, 50, 1200); L.flat(300);
      stepUp(100); cp();
      doubleJ(60, 360, 3600); cp(300, 400);
      L.whoops(10, 380, 46); L.flat(400);
      hill(200, 1800, 600); cp();
      L.freestyle(2.2); L.flat(400);
  
      // ===== CHAPTER 2: the long whoops and the rhythm section =====
      cp(300, 400);
      L.whoops(18, 380, 50); L.flat(500); cp();
      tableJ(80, 900, 1.15); cp();
      rhythm([50, 60, 70]); cp();
      L.hills(2800, 60, 1400); L.flat(300);
      stepDown(160); cp();
      triple(70); cp();
      L.freestyle(2.3); L.flat(400);
  
      // ===== CHAPTER 3: big crater hills and tabletops =====
      cp(300, 400);
      hill(300, 2400, 800); cp();
      steepTable(95, 1000, 45, 2500); cp();
      L.whoops(12, 400, 54); L.flat(400); cp();
      doubleJ(80, 420, 4200); cp(300, 400);
      stepUp(180); L.hills(2400, 60, 1200); cp();
      hill(380, 3000, 600); cp();
      steepTable(110, 1100, 50, 2800); cp();
      L.freestyle(2.4); L.flat(400);
  
      // ===== CHAPTER 4: the finale. Biggest jumps, a triple, the last freestyle =====
      cp(300, 400);
      L.whoops(14, 400, 56); L.flat(400); cp();
      rhythm([70, 85, 100]); cp();
      stepDown(220); L.hills(2800, 70, 1400); cp();
      steepTable(125, 1100, 55, 3200); cp();
      steepTriple(90, 55, 3200); cp();
      hill(300, 2400, 600); cp();
      steepDouble(110, 480, 50, 3000); cp(300, 400);
      L.whoops(10, 420, 56); L.flat(400); cp();
      L.freestyle(2.5);
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
      function chk(min) { // checkpoint on level ground, always BEFORE a big feature
        if (L.x() - lastCp > (min || 9000)) { L.flat(250); L.checkpoint(); L.flat(250); lastCp = L.x(); }
      }
      function chkNow() { L.flat(250); L.checkpoint(); L.flat(250); lastCp = L.x(); }
      function tbl(h, topExtra) {              // tabletop, h = lip height in px (66 = 1 m)
        L.table(Math.round(7.5 * h + 100), -h, 640 + (h - 66) * 3 + (topExtra || 0), Math.round(38 * h), Math.round(9.5 * h), Math.round(14 * h), Math.round(1.6 * h));
      }
      function dbl(h) {                        // double jump, h = lip height (80 = original)
        var k = h / 80;
        L.lip(Math.round(600 + (k - 1) * 300), -h); L.ramp(Math.round(120 * k), Math.round(50 * k)); L.flat(Math.round(110 * k));
        L.ramp(Math.round(110 * k), Math.round(-45 * k)); L.ramp(80, 10); L.ramp(Math.round(1800 * k), Math.round(420 * k)); L.ease(Math.round(900 * k), Math.round(90 * k));
      }
      function land(deg, drop) {               // steep landing, then a flat and a gentle climb to slow the bike
        L.steep(deg, drop); L.flat(700); L.bump(2400, -250); L.flat(400);
      }
      function tblS(h, deg, drop, topExtra) { // big tabletop with a steep landing
        L.lip(Math.round(7.5 * h + 100), -h); L.flat(640 + (h - 66) * 3 + (topExtra || 0)); land(deg, drop, h);
      }
      function dblS(h, deg, drop) {            // big double with a steep landing
        var k = h / 80;
        L.lip(Math.round(600 + (k - 1) * 300), -h); L.ramp(Math.round(120 * k), Math.round(50 * k)); L.flat(Math.round(110 * k));
        land(deg, drop);
      }
      function rhythm(n, s, gap) {             // n doubles in a row, each a bit bigger
        for (var i = 0; i < n; i++) {
          var k = s + 0.12 * i;
          L.lip(Math.round(480 * k), Math.round(-62 * k)); L.ramp(Math.round(100 * k), Math.round(30 * k)); L.flat(Math.round(90 * k));
          L.ramp(Math.round(100 * k), Math.round(-34 * k)); L.ramp(60, 8); L.ramp(Math.round(260 * k), Math.round(64 * k)); L.ease(Math.round(200 * k), Math.round(22 * k));
          L.flat(gap);
        }
      }
      function bigLoop(after) {                     // long run-up, the loop, a long flat so whoops never come in too fast
        chk(); L.flat(300);
        L.speed(60); L.flat(1100);
        L.loop(320);
        L.speed(50); L.flat((after || 1300) / 2); chk(3000); L.flat((after || 1300) / 2);
      }
      function hill(h, len) { L.bump(len, -h); L.flat(300); L.bump(len, h); L.flat(300); }
      function step(h) { L.bump(300, -h); L.flat(700); L.bump(300, h); L.flat(700); }
      L.speed(50);
  
      // ---- Chapter 1: warm-up (whoops, first tabletop, step-ups, loop 1) ----
      L.flat(1300);
      L.whoops(8, 240, 18); L.flat(400);
      chk(); tbl(70); L.flat(500);
      step(50); step(70);
      L.hills(2400, 28, 800); L.flat(400);
      bigLoop();                                                  // loop 1
      chk(); dbl(80); L.flat(500);
      L.whoops(12, 240, 20); L.flat(500);
      chk(); rhythm(3, 1.0, 160); L.flat(500);
      hill(300, 2400);
      chk(); L.freestyle(1); L.flat(400);                         // freestyle 1
  
      // ---- Chapter 2: rhythm and loops ----
      chk(); tblS(90, 45, 1200); L.flat(600);
      L.hills(3200, 34, 1000); L.flat(500);
      hill(220, 1800);
      bigLoop();                                                  // loop 2
      chk(); rhythm(4, 1.1, 120); L.flat(600);
      step(60); step(80);
      L.whoops(16, 240, 22); L.flat(500);
      chk(); dblS(100, 50, 1400); L.flat(500);
      hill(340, 2600);
      bigLoop();                                                  // loop 3
      chk(); tblS(100, 55, 1600); L.flat(600);
      L.whoops(10, 220, 20); L.flat(600);
      chk(); L.freestyle(1); L.flat(400);                         // freestyle 2
  
      // ---- Chapter 3: big hills, doubles, the long whoops ----
      chk(); hill(380, 2800);
      chk(); dblS(110, 55, 1600); L.flat(500);
      L.hills(2400, 30, 800); L.flat(500);
      bigLoop(3200);                                              // loop 4 (long flat: whoops follow)
      chk(); L.whoops(20, 240, 24); L.flat(600);
      chk(); tblS(120, 60, 1700); L.flat(600);
      step(70); step(90);
      chk(); rhythm(3, 1.15, 140); L.flat(600);
      hill(300, 2400);
      chk(); dblS(120, 60, 1700); L.flat(500);
      bigLoop();                                                  // loop 5
      chk(); L.freestyle(1); L.flat(400);                         // freestyle 3
  
      // ---- Chapter 4: the finale ----
      chk(); tblS(130, 65, 1900); L.flat(600);
      hill(300, 2600);
      L.whoops(14, 240, 24); L.flat(500);
      chk(); rhythm(4, 1.1, 120); L.flat(600);
      hill(380, 3000);
      chk(); dblS(130, 65, 1900); L.flat(500);
      step(80); step(100);
      chk(); tblS(110, 70, 2000, 150); L.flat(600);
      L.hills(2400, 30, 800); L.flat(500);
      bigLoop(3200);                                              // loop 6 (long flat: whoops follow)
      L.whoops(10, 240, 22); L.flat(600);
      chk(); rhythm(3, 1.1, 140); L.flat(600);
      chk(); L.freestyle(1);                                      // freestyle 4: the finale
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
