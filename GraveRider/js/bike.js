// =====================================================
// GRAVE RIDER — THE BIKE AND RIDER
// Bike = one chassis body (frame + rider) + two wheels
// held on by springs (the suspension).
// =====================================================
var Bike = (function () {
  var Bodies = Matter.Bodies,
      Body = Matter.Body,
      Composite = Matter.Composite,
      Constraint = Matter.Constraint;

  // Bike parts never collide with each other
  var BIKE_GROUP = -1;

  // --- Shape of the bike (pixels, relative to the bike's middle) ---
  var LAYOUT = {
    frame: { x: 0, y: 0, w: 74, h: 14 },
    torso: { x: -10, y: -30, w: 12, h: 30 },
    head: { x: -4, y: -56, r: 10 },
    wheelDrop: 30,     // how far below the frame the wheels sit
    springSpread: 42   // how far apart the two springs of each wheel attach
  };

  // --- Build a new bike at (x, y) and add it to the physics world ---
  function create(engine, x, y) {
    var L = LAYOUT;
    var half = CONFIG.wheelBase / 2;

    var frame = Bodies.rectangle(x + L.frame.x, y + L.frame.y, L.frame.w, L.frame.h, {
      density: CONFIG.chassisDensity
    });
    var torso = Bodies.rectangle(x + L.torso.x, y + L.torso.y, L.torso.w, L.torso.h, {
      isSensor: true, density: 0.0006
    });
    var head = Bodies.circle(x + L.head.x, y + L.head.y, L.head.r, {
      isSensor: true, density: 0.0006, label: "head"
    });

    var chassis = Body.create({
      parts: [frame, torso, head],
      collisionFilter: { group: BIKE_GROUP },
      friction: 0.4,
      frictionAir: 0.004,
      restitution: 0,
      label: "chassis"
    });

    var wheelOpts = {
      collisionFilter: { group: BIKE_GROUP },
      density: CONFIG.wheelDensity,
      friction: CONFIG.wheelGrip,
      frictionStatic: 2,
      frictionAir: 0.004,
      restitution: 0,
      slop: 0.01,
      label: "wheel"
    };
    var rear = Bodies.circle(x - half, y + L.wheelDrop, CONFIG.wheelRadius, wheelOpts, 24);
    var front = Bodies.circle(x + half, y + L.wheelDrop, CONFIG.wheelRadius, wheelOpts, 24);

    // The chassis "position" is its centre of mass, not (x, y), so
    // remember the difference for attaching springs and drawing.
    var com = { x: chassis.position.x - x, y: chassis.position.y - y };

    // Two springs per wheel, attached left and right of the wheel, form
    // a "V". The wheel can move up and down but can't swing sideways much.
    var springs = [];
    [rear, front].forEach(function (wheel) {
      var wx = wheel.position.x - x;
      [-L.springSpread, L.springSpread].forEach(function (dx) {
        springs.push(Constraint.create({
          bodyA: chassis,
          pointA: { x: wx + dx - com.x, y: -2 - com.y },
          bodyB: wheel,
          stiffness: CONFIG.suspensionStiffness,
          damping: 0, // damping is done by dampSprings() below instead
          render: { visible: false }
        }));
      });
    });

    // Where each wheel sits relative to the chassis centre when the springs are relaxed
    rear.restOffset = { x: rear.position.x - chassis.position.x, y: rear.position.y - chassis.position.y };
    front.restOffset = { x: front.position.x - chassis.position.x, y: front.position.y - chassis.position.y };

    var composite = Composite.create({ label: "bike" });
    Composite.add(composite, [chassis, rear, front].concat(springs));
    Composite.add(engine.world, composite);

    return {
      composite: composite,
      chassis: chassis,
      head: head,
      rear: rear,
      front: front,
      springs: springs,
      com: com,
      rearOnGround: false,
      frontOnGround: false,
      rearAir: 99,   // steps since each wheel last touched the ground
      frontAir: 99,
      headHit: false
    };
  }

  function remove(engine, bike) {
    Composite.remove(engine.world, bike.composite, true);
  }

  function onGround(bike) {
    return bike.rearOnGround || bike.frontOnGround;
  }

  // --- Copy slider values (suspension, grip) onto the live bike ---
  function applyTuning(bike, surfaceFriction, bounce) {
    bike.springs.forEach(function (s) {
      s.stiffness = CONFIG.suspensionStiffness;
    });
    [bike.rear, bike.front].forEach(function (w) {
      w.friction = CONFIG.wheelGrip * surfaceFriction;
      w.restitution = bounce;
    });
  }

  // --- Spin the whole bike around its middle (used for leaning) ---
  function addSpin(bike, amount) {
    var parts = [bike.chassis, bike.rear, bike.front];
    var mass = 0, cx = 0, cy = 0;
    parts.forEach(function (b) {
      mass += b.mass; cx += b.position.x * b.mass; cy += b.position.y * b.mass;
    });
    cx /= mass; cy /= mass;

    // Don't spin faster than the limit
    var current = bike.chassis.angularVelocity;
    var max = CONFIG.maxSpinSpeed;
    if (Math.abs(current) >= max && Math.sign(amount) === Math.sign(current)) return;
    var next = Math.max(-max, Math.min(max, current + amount));
    var d = next - current;
    if (d === 0) return;

    // Push every part so the whole bike turns together (no fighting the springs)
    parts.forEach(function (b) {
      var rx = b.position.x - cx, ry = b.position.y - cy;
      Body.setVelocity(b, { x: b.velocity.x - d * ry, y: b.velocity.y + d * rx });
    });
    Body.setAngularVelocity(bike.chassis, current + d);
  }

  // --- Spring damping (stops the suspension bouncing forever) ---
  // Matter.js's own spring damping ignores the bike's rotation and kills
  // flips, so this version measures how fast each spring is stretching,
  // including the rotation, and only slows that down.
  function dampSprings(bike) {
    var c = bike.chassis, w = c.angularVelocity;
    bike.springs.forEach(function (s) {
      var wheel = s.bodyB;
      var ax = c.position.x + s.pointA.x, ay = c.position.y + s.pointA.y;
      var nx = wheel.position.x - ax, ny = wheel.position.y - ay;
      var len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      // Speed of the attachment point (moving + turning with the chassis)
      var avx = c.velocity.x - w * s.pointA.y, avy = c.velocity.y + w * s.pointA.x;
      var stretchSpeed = (wheel.velocity.x - avx) * nx + (wheel.velocity.y - avy) * ny;
      var k = stretchSpeed * CONFIG.suspensionDamping * 0.5;
      var total = c.mass + wheel.mass;
      Body.setVelocity(wheel, {
        x: wheel.velocity.x - nx * k * c.mass / total,
        y: wheel.velocity.y - ny * k * c.mass / total
      });
      Body.setVelocity(c, {
        x: c.velocity.x + nx * k * wheel.mass / total,
        y: c.velocity.y + ny * k * wheel.mass / total
      });
    });
  }

  // --- Apply player controls. Called once per physics step. ---
  // input: { gas, brake, leanBack, leanForward }
  function control(bike, input) {
    var rear = bike.rear, front = bike.front;
    // Which way is "forward" for the wheel spin (along the bike's nose)
    var fwdX = Math.cos(bike.chassis.angle), fwdY = Math.sin(bike.chassis.angle);
    var forwardSpeed = bike.chassis.velocity.x * fwdX + bike.chassis.velocity.y * fwdY;

    if (input.gas) {
      // Rear-wheel drive: spin the back wheel up to top speed
      var av = rear.angularVelocity;
      if (av < CONFIG.maxWheelSpeed) {
        Body.setAngularVelocity(rear, Math.min(av + CONFIG.enginePower, CONFIG.maxWheelSpeed));
      }
    } else if (input.brake) {
      if (forwardSpeed > 0.8) {
        // Brake: slow both wheels down
        Body.setAngularVelocity(rear, rear.angularVelocity * (1 - CONFIG.brakeStrength));
        Body.setAngularVelocity(front, front.angularVelocity * (1 - CONFIG.brakeStrength));
      } else {
        // Nearly stopped: reverse
        var rv = rear.angularVelocity;
        if (rv > -CONFIG.maxReverseSpeed) {
          Body.setAngularVelocity(rear, Math.max(rv - CONFIG.reversePower, -CONFIG.maxReverseSpeed));
        }
      }
    }

    var lean = (input.leanForward ? 1 : 0) - (input.leanBack ? 1 : 0);
    if (lean !== 0) {
      var strength = CONFIG.leanStrength * (onGround(bike) ? CONFIG.groundLeanFactor : 1);
      addSpin(bike, lean * strength);
    } else if (!onGround(bike)) {
      // Let go of lean in the air: spin slowly fades so flips are controllable
      var w = bike.chassis.angularVelocity;
      addSpin(bike, w * (CONFIG.airSpinDamping - 1));
    }
  }

  // --- Speed limit so a huge fall can't push the wheels into the ground ---
  function limitSpeed(bike) {
    [bike.chassis, bike.rear, bike.front].forEach(function (b) {
      var v = b.velocity, speed = Math.hypot(v.x, v.y);
      if (speed > CONFIG.maxPartSpeed) {
        var k = CONFIG.maxPartSpeed / speed;
        Body.setVelocity(b, { x: v.x * k, y: v.y * k });
      }
    });
  }

  // --- Bump stop: a hard landing can't squash the suspension flat ---
  // (without this the frame can slam through the springs and end up
  // below the wheels). Called after each physics step.
  function limitTravel(bike) {
    var c = bike.chassis, cos = Math.cos(c.angle), sin = Math.sin(c.angle);
    [bike.rear, bike.front].forEach(function (wheel) {
      // Wheel position in the bike's own (rotated) frame
      var dx = wheel.position.x - c.position.x, dy = wheel.position.y - c.position.y;
      var ly = -dx * sin + dy * cos;
      var push = wheel.restOffset.y - CONFIG.suspensionTravel - ly;
      if (push <= 0) return;

      // Push wheel and chassis apart, the lighter one moves more
      var total = c.mass + wheel.mass;
      var px = -sin * push, py = cos * push; // the bike's "down" direction
      Body.setPosition(wheel, { x: wheel.position.x + px * c.mass / total, y: wheel.position.y + py * c.mass / total });
      Body.setPosition(c, { x: c.position.x - px * wheel.mass / total, y: c.position.y - py * wheel.mass / total });

      // Stop them moving into each other (like hitting a rubber stop)
      var closing = (c.velocity.x - wheel.velocity.x) * -sin + (c.velocity.y - wheel.velocity.y) * cos;
      if (closing > 0) {
        var kw = closing * c.mass / total, kc = closing * wheel.mass / total;
        Body.setVelocity(wheel, { x: wheel.velocity.x - sin * kw, y: wheel.velocity.y + cos * kw });
        Body.setVelocity(c, { x: c.velocity.x + sin * kc, y: c.velocity.y - cos * kc });
      }
    });
  }

  // --- After each physics step: what is touching the ground? ---
  // A rolling wheel can lose touch for a single step on bumps, so a
  // wheel counts as "on the ground" if it touched in the last few steps.
  var CONTACT_GRACE_STEPS = 4;

  function updateContacts(bike, engine) {
    var rearHit = false, frontHit = false;
    bike.headHit = false;
    var pairs = engine.pairs.list;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (!p.isActive) continue;
      var a = p.bodyA, b = p.bodyB;
      var other;
      if (a.parent.label === "ground") other = b;
      else if (b.parent.label === "ground") other = a;
      else continue;
      if (other === bike.rear) rearHit = true;
      else if (other === bike.front) frontHit = true;
      else if (other === bike.head) bike.headHit = true;
    }
    bike.rearAir = rearHit ? 0 : bike.rearAir + 1;
    bike.frontAir = frontHit ? 0 : bike.frontAir + 1;
    bike.rearOnGround = bike.rearAir < CONTACT_GRACE_STEPS;
    bike.frontOnGround = bike.frontAir < CONTACT_GRACE_STEPS;
  }

  // --- Drawing ---
  function local(bike, lx, ly) {
    // Turn a point on the bike drawing into a world point
    var c = bike.chassis, a = c.angle;
    var x = lx - bike.com.x, y = ly - bike.com.y;
    return {
      x: c.position.x + x * Math.cos(a) - y * Math.sin(a),
      y: c.position.y + x * Math.sin(a) + y * Math.cos(a)
    };
  }

  function drawWheel(ctx, w) {
    var r = CONFIG.wheelRadius;
    ctx.save();
    ctx.translate(w.position.x, w.position.y);
    ctx.rotate(w.angle);
    ctx.fillStyle = "#1a1a1f";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ff8a1f";
    ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      var ang = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r - 5), Math.sin(ang) * (r - 5));
      ctx.lineTo(-Math.cos(ang) * (r - 5), -Math.sin(ang) * (r - 5));
      ctx.stroke();
    }
    ctx.fillStyle = "#ff8a1f";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function line(ctx, p, q, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }

  function draw(ctx, bike) {
    // Swing arm (back) and fork (front) connect frame to wheels
    line(ctx, local(bike, -18, 4), bike.rear.position, "#888", 6);
    line(ctx, local(bike, 30, -12), bike.front.position, "#aaa", 5);
    drawWheel(ctx, bike.rear);
    drawWheel(ctx, bike.front);

    // Frame and rider are drawn in the bike's own rotated space
    var c = bike.chassis;
    ctx.save();
    ctx.translate(c.position.x, c.position.y);
    ctx.rotate(c.angle);
    ctx.translate(-bike.com.x, -bike.com.y);

    // Frame
    ctx.fillStyle = "#ff8a1f";
    ctx.beginPath();
    ctx.moveTo(-37, -7); ctx.lineTo(10, -9); ctx.lineTo(37, -14);
    ctx.lineTo(37, 2); ctx.lineTo(10, 7); ctx.lineTo(-30, 7);
    ctx.closePath(); ctx.fill();
    // Seat
    ctx.fillStyle = "#222";
    ctx.fillRect(-30, -12, 30, 6);
    // Handlebar
    line(ctx, { x: 30, y: -12 }, { x: 26, y: -26 }, "#ccc", 4);

    // Rider: legs, body, arms, head
    line(ctx, { x: -12, y: -12 }, { x: 4, y: -2 }, "#5a2d82", 7);   // thigh
    line(ctx, { x: 4, y: -2 }, { x: 2, y: 8 }, "#5a2d82", 6);       // shin
    line(ctx, { x: -12, y: -14 }, { x: -6, y: -44 }, "#7b3fb3", 11);// body
    line(ctx, { x: -6, y: -42 }, { x: 12, y: -30 }, "#7b3fb3", 5);  // upper arm
    line(ctx, { x: 12, y: -30 }, { x: 26, y: -26 }, "#7b3fb3", 5);  // forearm
    // Helmet with a skull face
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath(); ctx.arc(LAYOUT.head.x, LAYOUT.head.y, LAYOUT.head.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(LAYOUT.head.x + 4, LAYOUT.head.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(LAYOUT.head.x - 2, LAYOUT.head.y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(LAYOUT.head.x - 1, LAYOUT.head.y + 4, 6, 1.5);
    ctx.restore();
  }

  return {
    create: create,
    remove: remove,
    control: control,
    dampSprings: dampSprings,
    limitSpeed: limitSpeed,
    limitTravel: limitTravel,
    updateContacts: updateContacts,
    applyTuning: applyTuning,
    onGround: onGround,
    draw: draw
  };
})();
