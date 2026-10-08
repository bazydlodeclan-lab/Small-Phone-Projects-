// =====================================================
// GRAVE RIDER — THE BIKE AND RIDER (Planck.js physics)
//
// Modelled on a real electric motocross bike (see js/config.js for
// every number and where it comes from):
//   chassis  = frame, battery, motor, seat, plastics (one body)
//   wheels   = on wheel joints: each slides along the fork / shock line
//              on a spring + damper with real travel and hard stops.
//              The rear one is driven by the electric motor (chain,
//              single speed); both have brakes.
//   rider    = separate body standing on the footpegs; leans with the
//              arrow keys and falls off when you crash
//
// Units are metres, kilograms, seconds. y grows DOWNWARD.
// =====================================================
var Bike = (function () {
  var pl = planck, Vec2 = pl.Vec2;
  var BIKE_GROUP = -1; // bike parts never collide with each other
  var RAKE = 27.3 * Math.PI / 180; // steering head angle [SPEC]

  // --- Real geometry in metres, relative to the chassis origin, with the
  // suspension fully extended. The origin sits 0.641 m above the ground. ---
  var GEO = {
    rearAxle:   { x: -0.720, y: 0.300 },  // wheelbase 1.487 m [SPEC]
    frontAxle:  { x: 0.767, y: 0.293 },   // (front tyre is 7 mm taller)
    rearAxis:   { x: 0.0995, y: 0.995 },  // rear wheel moves along this (down)
    frontAxis:  { x: Math.sin(RAKE), y: Math.cos(RAKE) }, // along the fork (down)
    forkTop:    { x: 0.380, y: -0.460 },
    swingPivot: { x: -0.120, y: 0.100 },
    footpeg:    { x: -0.080, y: 0.220 },
    grip:       { x: 0.280, y: -0.520 },
    // bike centre of mass (battery + motor sit low) [ESTIMATE]
    centreOfMass: { x: 0.020, y: 0.050 },
    // collision outline of the bike body (for crashes / belly landings)
    body: [{ x: -0.55, y: -0.38 }, { x: 0.40, y: -0.48 }, { x: 0.50, y: -0.30 },
           { x: 0.25, y: 0.27 }, { x: -0.30, y: 0.27 }],
    // rider body, relative to the footpeg
    shoulder:   { x: 0.0, y: -1.02 },
    head:       { x: 0.08, y: -1.24, r: 0.13 },
    torso:      { x: -0.14, y: -0.84, hw: 0.12, hh: 0.25, angle: 0.58 }
  };

  function v(p) { return Vec2(p.x, p.y); }
  function add(a, b) { return Vec2(a.x + b.x, a.y + b.y); }

  function makeBody(world, type, pos, label) {
    return world.createBody({
      type: type, position: pos, allowSleep: false, userData: label
    });
  }

  // --- Build a new bike with its chassis origin at (x, y) metres ---
  function create(world, x, y) {
    var origin = Vec2(x, y);

    // Chassis: everything except the wheels
    var chassis = makeBody(world, "dynamic", origin, "chassis");
    chassis.createFixture({
      shape: pl.Polygon(GEO.body.map(v)), density: 1,
      friction: 0.5, filterGroupIndex: BIKE_GROUP, userData: "chassis"
    });
    var chassisMass = CONFIG.bikeMass - CONFIG.frontWheelMass - CONFIG.rearWheelMass;
    chassis.setMassData({
      mass: chassisMass, center: v(GEO.centreOfMass),
      I: chassisMass * (1.4 * 1.4 + 0.6 * 0.6) / 12 // pitch inertia of a 1.4 × 0.6 m block
    });

    function makeWheel(axlePos, axisDir, travel, preload, radius, mass, inertia) {
      var pos = add(origin, axlePos);
      var wheel = makeBody(world, "dynamic", pos, "wheel");
      wheel.createFixture({
        shape: pl.Circle(radius), density: 1,
        friction: CONFIG.wheelGrip, restitution: 0,
        filterGroupIndex: BIKE_GROUP, userData: "wheel"
      });
      wheel.setMassData({ mass: mass, center: Vec2(0, 0), I: inertia });
      // Wheel joint = suspension spring + damper along the fork/shock line,
      // and a motor (electric motor on the rear, brakes on both).
      // The spring's resting point is "preload" metres further out than full
      // extension, so the spring is already pushing when the bike is in the air.
      var joint = world.createJoint(pl.WheelJoint({
        bodyA: chassis, bodyB: wheel,
        localAnchorA: Vec2(axlePos.x + axisDir.x * preload, axlePos.y + axisDir.y * preload),
        localAnchorB: Vec2(0, 0),
        localAxisA: v(axisDir),
        enableMotor: false, maxMotorTorque: 0, motorSpeed: 0,
        frequencyHz: 1, dampingRatio: 0.5
      }));
      // Hard stops at both ends of the travel (two "ropes" along the axis:
      // one stops the wheel dropping past full extension, one stops it
      // squashing past full travel = bottoming out)
      world.createJoint(pl.RopeJoint({
        bodyA: chassis, bodyB: wheel, localAnchorB: Vec2(0, 0),
        localAnchorA: Vec2(axlePos.x - axisDir.x, axlePos.y - axisDir.y), maxLength: 1
      }));
      world.createJoint(pl.RopeJoint({
        bodyA: chassis, bodyB: wheel, localAnchorB: Vec2(0, 0),
        localAnchorA: Vec2(axlePos.x + axisDir.x, axlePos.y + axisDir.y), maxLength: 1 + travel
      }));
      return { wheel: wheel, joint: joint, travel: travel, preload: preload, axis: axisDir, radius: radius };
    }

    var Rf = CONFIG.frontWheelRadius, Rr = CONFIG.rearWheelRadius;
    // Rear wheel inertia includes the motor's spinning parts seen through the chain
    var rear = makeWheel(GEO.rearAxle, GEO.rearAxis, CONFIG.rearTravel, CONFIG.rearPreload,
      Rr, CONFIG.rearWheelMass, CONFIG.drivetrainInertia);
    var front = makeWheel(GEO.frontAxle, GEO.frontAxis, CONFIG.frontTravel, CONFIG.frontPreload,
      Rf, CONFIG.frontWheelMass, CONFIG.frontWheelMass * 0.3 * 0.3 * 0.85);

    // Rider: stands on the footpegs, can lean back and forward
    var pegPos = add(origin, GEO.footpeg);
    var rider = makeBody(world, "dynamic", pegPos, "rider");
    var T = GEO.torso, H = GEO.head;
    var torsoArea = 4 * T.hw * T.hh, headArea = Math.PI * H.r * H.r;
    var riderDensity = CONFIG.riderMass / (torsoArea + headArea);
    rider.createFixture({
      shape: pl.Box(T.hw, T.hh, Vec2(T.x, T.y), T.angle), density: riderDensity,
      friction: 0.6, filterGroupIndex: BIKE_GROUP, userData: "torso"
    });
    rider.createFixture({
      shape: pl.Circle(Vec2(H.x, H.y), H.r), density: riderDensity,
      friction: 0.6, filterGroupIndex: BIKE_GROUP, userData: "head"
    });
    var hips = world.createJoint(pl.RevoluteJoint({
      enableLimit: true, lowerAngle: -0.6, upperAngle: 0.6,
      enableMotor: true, maxMotorTorque: CONFIG.riderStrength, motorSpeed: 0
    }, chassis, rider, pegPos));

    var bike = {
      world: world,
      chassis: chassis,
      rider: rider,
      hips: hips,
      rear: rear,
      front: front,
      rearOnGround: false,
      frontOnGround: false,
      rearAir: 99,   // steps since each wheel last touched the ground
      frontAir: 99,
      riderHit: false,
      crashed: false,
      groundAngle: 0  // slope under the rear tyre (radians, 0 = flat)
    };
    suspension(bike);
    return bike;
  }

  function remove(world, bike) {
    [bike.chassis, bike.rider, bike.rear.wheel, bike.front.wheel]
      .forEach(function (b) { world.destroyBody(b); });
  }

  function onGround(bike) {
    return bike.rearOnGround || bike.frontOnGround;
  }

  // How far each end is squashed from full extension (m)
  function compression(s) {
    return -(s.joint.getJointTranslation() + s.preload);
  }

  // --- Copy slider values (grip, bounce) onto the live bike ---
  function applyTuning(bike, surfaceFriction, bounce) {
    [bike.rear.wheel, bike.front.wheel].forEach(function (w) {
      var f = w.getFixtureList();
      f.setFriction(CONFIG.wheelGrip * surfaceFriction);
      f.setRestitution(bounce);
    });
  }

  // --- Suspension springs and dampers. Called every step. ---
  // Planck describes a spring by how fast it would bounce the wheel alone,
  // so convert the real spring rate (N/m) and damping into its terms.
  function suspension(bike) {
    var sprungTotal = CONFIG.bikeMass - CONFIG.frontWheelMass - CONFIG.rearWheelMass + CONFIG.riderMass;
    [[bike.rear, CONFIG.rearSpringRate, CONFIG.rearDamping, 0.55],
     [bike.front, CONFIG.frontSpringRate, CONFIG.frontDamping, 0.45]].forEach(function (e) {
      var s = e[0], k = e[1] * CONFIG.suspensionStiffness, zeta = e[2];
      var sprung = sprungTotal * e[3];   // weight carried by this end [ESTIMATE: 55% rear]
      var mEff = 1 / (1 / bike.chassis.getMass() + 1 / s.wheel.getMass());
      s.joint.setSpringFrequencyHz(Math.sqrt(k / mEff) / (2 * Math.PI));
      s.joint.setSpringDampingRatio(zeta * Math.sqrt(sprung / mEff));

      // Bottoming cushion: real forks (hydraulic cones) and shocks (bump
      // stops) get much stiffer in the last 15% of travel
      var deep = compression(s) - 0.85 * s.travel;
      if (deep > 0) {
        var push = CONFIG.bottomingStiffness * k * deep;
        var dir = bike.chassis.getWorldVector(v(s.axis));
        var at = s.wheel.getPosition();
        s.wheel.applyForce(Vec2(dir.x * push, dir.y * push), at, true);
        bike.chassis.applyForce(Vec2(-dir.x * push, -dir.y * push), at, true);
      }
    });
  }

  // --- Air drag and rolling resistance. Called every step. ---
  function resistance(bike, gravity) {
    var c = bike.chassis, vel = c.getLinearVelocity();
    var speed = Math.hypot(vel.x, vel.y);
    if (speed < 0.05) return;
    var ux = vel.x / speed, uy = vel.y / speed;
    // Air drag: ½ × air density × (drag × area) × speed²
    var drag = 0.5 * CONFIG.airDensity * CONFIG.dragArea * speed * speed;
    c.applyForce(Vec2(-ux * drag, -uy * drag), c.getWorldCenter(), true);
    // Rolling resistance on each wheel touching the ground
    var weight = (CONFIG.bikeMass + CONFIG.riderMass) * gravity;
    [[bike.rear, bike.rearOnGround, 0.55], [bike.front, bike.frontOnGround, 0.45]].forEach(function (e) {
      if (!e[1]) return;
      var f = CONFIG.rollingResistance * weight * e[2];
      e[0].wheel.applyForceToCenter(Vec2(-ux * f, -uy * f), true);
    });
  }

  // --- Throttle control: like a real rider easing off the throttle when the
  // front wheel comes up too high. Returns 0..1 (how much power to use).
  function throttleControl(bike) {
    if (!CONFIG.throttleControl || !bike.rearOnGround) return 1;
    return wheelspinControl(bike) * wheelieControl(bike);
  }

  // Too much wheelspin on dirt = no grip. A rider rolls off until the tyre
  // bites again (keeps the tyre surface within a few m/s of the bike's speed).
  function wheelspinControl(bike) {
    var c = bike.chassis, vel = c.getLinearVelocity();
    var surface = (bike.rear.wheel.getAngularVelocity() - c.getAngularVelocity()) * bike.rear.radius;
    var slip = surface - Math.hypot(vel.x, vel.y);
    var allowed = CONFIG.maxWheelspin;
    if (slip <= allowed) return 1;
    return Math.max(0.15, 1 - (slip - allowed) / 3);
  }

  function wheelieControl(bike) {
    // Only once the front wheel is actually up
    if (bike.frontAir < 3) return 1;
    // How far the nose is pointing up compared to the ground under the
    // rear tyre (on a hill, "level" is the slope, not flat)
    var a = bike.chassis.getAngle() - bike.groundAngle;
    var noseUp = -Math.atan2(Math.sin(a), Math.cos(a));
    // Look a moment ahead: a fast-rising front wheel needs easing off sooner
    noseUp += Math.max(0, -bike.chassis.getAngularVelocity()) * 0.25;
    // On an uphill the weight is already further back, so a rider allows
    // less wheelie the steeper the hill
    var uphill = Math.max(0, -bike.groundAngle);
    var limit = Math.max(0.12, CONFIG.wheelieLimit - 0.8 * uphill);
    var start = limit - 0.35;
    if (noseUp <= start) return 1;
    return Math.max(0, 1 - (noseUp - start) / 0.35);
  }

  // --- Apply player controls. Called once per physics step. ---
  // input: { gas, brake, leanBack, leanForward }
  function control(bike, input) {
    var c = bike.chassis;
    var vel = c.getLinearVelocity();
    var fwd = c.getWorldVector(Vec2(1, 0));
    var forwardSpeed = vel.x * fwd.x + vel.y * fwd.y;
    var rearJ = bike.rear.joint, frontJ = bike.front.joint;
    var Rr = bike.rear.radius;

    if (input.gas) {
      // Electric motor: full torque up to the speed where it reaches full
      // power, then constant power (torque falls as the wheel spins faster)
      var wheelSpin = Math.abs(bike.rear.wheel.getAngularVelocity() - c.getAngularVelocity());
      var torque = Math.min(CONFIG.wheelTorque, CONFIG.motorPower / Math.max(wheelSpin, 1));
      var targetSpin = CONFIG.topSpeed / Rr;
      // In the air a real rider holds the throttle steady instead of pinning
      // it, so the wheel keeps matching the bike's speed (a racing wheel would
      // twist the bike over backwards). Part of throttle control.
      if (CONFIG.throttleControl && bike.rearAir > 5 && bike.frontAir > 5) {
        targetSpin = Math.min(targetSpin, Math.hypot(vel.x, vel.y) / Rr);
      }
      rearJ.enableMotor(true);
      rearJ.setMotorSpeed(targetSpin);
      rearJ.setMaxMotorTorque(torque * throttleControl(bike));
      frontJ.enableMotor(false);
    } else if (input.brake) {
      if (forwardSpeed > 0.5) {
        // Front and rear brakes. Like a real rider, ease the front brake
        // when the rear wheel starts lifting (stops you going over the bars)
        var front = CONFIG.frontBrakeTorque;
        if (CONFIG.throttleControl && bike.frontOnGround && bike.rearAir > 2) front *= 0.25;
        rearJ.enableMotor(true); rearJ.setMotorSpeed(0); rearJ.setMaxMotorTorque(CONFIG.rearBrakeTorque);
        frontJ.enableMotor(true); frontJ.setMotorSpeed(0); frontJ.setMaxMotorTorque(front);
      } else {
        // Nearly stopped: back up slowly
        rearJ.enableMotor(true);
        rearJ.setMotorSpeed(-CONFIG.reverseSpeed / Rr);
        rearJ.setMaxMotorTorque(150);
        frontJ.enableMotor(false);
      }
    } else {
      // Off the throttle: a little motor drag on the rear wheel [ESTIMATE]
      rearJ.enableMotor(true); rearJ.setMotorSpeed(0); rearJ.setMaxMotorTorque(20);
      frontJ.enableMotor(false);
    }

    var lean = (input.leanForward ? 1 : 0) - (input.leanBack ? 1 : 0);

    // The rider shifts their weight (real physics through the hip joint).
    // Braking without leaning: the rider shifts back on their own.
    var target = lean * CONFIG.riderLeanAngle;
    if (lean === 0 && input.brake && !input.gas) target = -0.6 * CONFIG.riderLeanAngle;
    if (bike.hips) {
      // Shift weight smoothly (a real rider can't throw their body instantly)
      var leanSpeed = (target - bike.hips.getJointAngle()) * 10;
      bike.hips.setMotorSpeed(Math.max(-CONFIG.riderLeanSpeed, Math.min(CONFIG.riderLeanSpeed, leanSpeed)));
    }

    // Flip assist: extra turning so flips are possible (0 = real life)
    if (lean !== 0 && CONFIG.flipAssist > 0) {
      var wSpin = c.getAngularVelocity();
      if (!(Math.abs(wSpin) >= CONFIG.maxSpinSpeed && Math.sign(wSpin) === lean)) {
        var strength = CONFIG.flipAssist * (onGround(bike) ? CONFIG.groundLeanFactor : 1);
        c.applyTorque(lean * strength, true);
      }
    }
  }

  // --- The rider lets go when they crash ---
  function letGo(bike) {
    if (bike.crashed) return;
    bike.crashed = true;
    bike.world.destroyJoint(bike.hips);
    bike.hips = null;
    bike.rear.joint.enableMotor(false);
    bike.front.joint.enableMotor(false);
  }

  // --- After each physics step: what is touching the ground? ---
  // A wheel counts as "on the ground" if it touched in the last few steps
  // (bumps can lift it for a single step).
  var CONTACT_GRACE_STEPS = 3;

  function touchesGround(body, onlyFixtures) {
    for (var ce = body.getContactList(); ce; ce = ce.next) {
      var ct = ce.contact;
      if (!ct.isTouching() || ce.other.getUserData() !== "ground") continue;
      if (!onlyFixtures) return true;
      var mine = ct.getFixtureA().getBody() === body ? ct.getFixtureA() : ct.getFixtureB();
      if (onlyFixtures.indexOf(mine.getUserData()) >= 0) return true;
    }
    return false;
  }

  // Angle of the ground under a wheel (0 = flat), from the contact normal
  function groundAngleUnder(wheel) {
    for (var ce = wheel.getContactList(); ce; ce = ce.next) {
      var ct = ce.contact;
      if (!ct.isTouching() || ce.other.getUserData() !== "ground") continue;
      var wm = ct.getWorldManifold(null), n = wm.normal, c = wheel.getPosition(), p = wm.points[0];
      var nx = n.x, ny = n.y;
      if (p && (c.x - p.x) * nx + (c.y - p.y) * ny < 0) { nx = -nx; ny = -ny; } // point away from the ground
      return Math.atan2(nx, -ny);
    }
    return null;
  }

  function updateContacts(bike) {
    var ga = groundAngleUnder(bike.rear.wheel);
    if (ga !== null) bike.groundAngle = ga;
    bike.rearAir = touchesGround(bike.rear.wheel) ? 0 : bike.rearAir + 1;
    bike.frontAir = touchesGround(bike.front.wheel) ? 0 : bike.frontAir + 1;
    bike.rearOnGround = bike.rearAir < CONTACT_GRACE_STEPS;
    bike.frontOnGround = bike.frontAir < CONTACT_GRACE_STEPS;
    // The rider's head or body hitting the ground = crash
    bike.riderHit = touchesGround(bike.rider, ["head", "torso"]);
  }

  // =====================================================
  // DRAWING (everything in metres; game.js sets the scale)
  // =====================================================
  var images = {};
  function loadArt() {
    Object.keys(ART).forEach(function (key) {
      var img = new Image();
      img.src = ART[key];
      images[key] = img;
    });
  }
  function ready(img) { return img && img.complete && img.naturalWidth > 0; }

  // Where each picture goes, in metres (see art/README.md)
  var PLACE = {
    bike:  { x: -1.10, y: -0.75, w: 2.20, h: 1.10 },  // relative to chassis centre
    rider: { x: -0.45, y: -1.42, w: 0.75, h: 1.47 }   // relative to footpeg
  };

  function inBodySpace(ctx, body, fn) {
    var p = body.getPosition();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(body.getAngle());
    fn();
    ctx.restore();
  }

  function metalLine(ctx, a, b, width, dark, light) {
    ctx.lineCap = "round";
    ctx.strokeStyle = dark; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = width * 0.35;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function drawWheel(ctx, w, R, img) {
    inBodySpace(ctx, w, function () {
      if (ready(img)) ctx.drawImage(img, -R, -R, 2 * R, 2 * R);
      else { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); }
    });
  }

  // Two-bone arm from shoulder to handlebar grip (elbow bends down/back)
  function drawArm(ctx, shoulder, grip) {
    var upper = 0.31, fore = 0.31;
    var dx = grip.x - shoulder.x, dy = grip.y - shoulder.y;
    var d = Math.min(Math.hypot(dx, dy), upper + fore - 0.001);
    var a = Math.atan2(dy, dx);
    var bend = Math.acos((upper * upper + d * d - fore * fore) / (2 * upper * d));
    var elbow = { x: shoulder.x + Math.cos(a + bend) * upper, y: shoulder.y + Math.sin(a + bend) * upper };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#f2f3f5"; ctx.lineWidth = 0.11;
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(elbow.x, elbow.y); ctx.lineTo(grip.x, grip.y); ctx.stroke();
    ctx.strokeStyle = "#1d1f23"; ctx.lineWidth = 0.035; // jersey stripe
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(elbow.x, elbow.y); ctx.stroke();
    ctx.fillStyle = "#151515"; // glove
    ctx.beginPath(); ctx.arc(grip.x, grip.y, 0.055, 0, Math.PI * 2); ctx.fill();
  }

  function draw(ctx, bike) {
    var c = bike.chassis;
    // Swingarm (back) and fork (front) connect the frame to the moving wheels
    var pivot = c.getWorldPoint(v(GEO.swingPivot));
    var rearAxle = bike.rear.wheel.getPosition();
    metalLine(ctx, pivot, rearAxle, 0.09, "#3a3a40", "#8d8d96");
    var forkTop = c.getWorldPoint(v(GEO.forkTop));
    var frontAxle = bike.front.wheel.getPosition();
    drawWheel(ctx, bike.rear.wheel, bike.rear.radius, images.rearWheel);
    drawWheel(ctx, bike.front.wheel, bike.front.radius, images.wheel);

    // Frame, engine, seat and plastics
    inBodySpace(ctx, c, function () {
      var P = PLACE.bike;
      if (ready(images.bike)) ctx.drawImage(images.bike, P.x, P.y, P.w, P.h);
      else { ctx.fillStyle = "#e8742a"; ctx.fillRect(-0.48, -0.22, 0.96, 0.34); }
    });

    // Front fork: silver tube from the clamp, gold leg sliding to the axle
    metalLine(ctx, forkTop, frontAxle, 0.07, "#1d1d22", "#c9c9d1");
    var dx = frontAxle.x - forkTop.x, dy = frontAxle.y - forkTop.y, len = Math.hypot(dx, dy) || 1;
    var legTop = { x: frontAxle.x - dx / len * 0.42, y: frontAxle.y - dy / len * 0.42 };
    metalLine(ctx, legTop, frontAxle, 0.10, "#b8860b", "#f7d774");

    // Rider (body picture + arms reaching to the handlebar)
    var r = bike.rider;
    inBodySpace(ctx, r, function () {
      var P = PLACE.rider;
      if (ready(images.rider)) ctx.drawImage(images.rider, P.x, P.y, P.w, P.h);
      else { ctx.fillStyle = "#5a2d82"; ctx.fillRect(-0.26, -1.09, 0.24, 0.5); }
    });
    if (!bike.crashed) {
      var shoulder = r.getWorldPoint(v(GEO.shoulder));
      var grip = c.getWorldPoint(v(GEO.grip));
      drawArm(ctx, shoulder, grip);
    }
  }

  return {
    create: create,
    remove: remove,
    control: control,
    suspension: suspension,
    resistance: resistance,
    compression: compression,
    letGo: letGo,
    updateContacts: updateContacts,
    applyTuning: applyTuning,
    onGround: onGround,
    loadArt: loadArt,
    draw: draw
  };
})();
