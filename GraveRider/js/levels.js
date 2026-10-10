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

var LEVELS = [
  // ---------------- TEST LEVEL ----------------
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
  }
];
