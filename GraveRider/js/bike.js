// =====================================================
// GRAVE RIDER — THE BIKE AND RIDER (Planck.js physics)
//
// How the bike is built (like a real dirt bike):
//   chassis  = frame, engine, seat (one body, 105 kg)
//   wheels   = on wheel joints: each slides up and down on a spring +
//              damper (suspension) with hard stops, and the rear one is
//              driven by the engine motor
//   rider    = separate body standing on the footpegs; leans with
//              the arrow keys and falls off when you crash
//
// Units are metres, kilograms, seconds. y grows DOWNWARD.
// =====================================================
var Bike = (function () {
  var pl = planck, Vec2 = pl.Vec2;
  var BIKE_GROUP = -1; // bike parts never collide with each other

  // --- Shape of the bike in metres, relative to the chassis centre ---
  var GEO = {
    rearAxle:  { x: -0.72, y: 0.20 },
    frontAxle: { x: 0.76, y: 0.20 },
    rearAxis:  { x: 0.18, y: 0.98 },   // direction the rear wheel moves (down)
    frontAxis: { x: 0.316, y: 0.949 }, // fork angle (down along the fork)
    forkTop:   { x: 0.52, y: -0.52 },
    swingPivot:{ x: -0.10, y: 0.02 },
    footpeg:   { x: -0.05, y: 0.12 },
    grip:      { x: 0.46, y: -0.62 },
    // rider body, relative to the footpeg
    shoulder:  { x: 0.0, y: -1.02 },
    head:      { x: 0.08, y: -1.24, r: 0.13 },
    torso:     { x: -0.14, y: -0.84, hw: 0.12, hh: 0.25, angle: 0.58 }
  };

  function v(p) { return Vec2(p.x, p.y); }
  function add(a, b) { return Vec2(a.x + b.x, a.y + b.y); }

  function makeBody(world, type, pos, label) {
    return world.createBody({
      type: type, position: pos, allowSleep: false, userData: label
    });
  }

  // --- Build a new bike with its chassis centre at (x, y) metres ---
  function create(world, x, y) {
    var origin = Vec2(x, y);
    var R = CONFIG.wheelRadius;

    // Chassis: frame + engine block
    var chassis = makeBody(world, "dynamic", origin, "chassis");
    var frameShape = pl.Box(0.48, 0.17, Vec2(0, -0.05), 0);
    var frameArea = 0.96 * 0.34;
    chassis.createFixture({
      shape: frameShape, density: CONFIG.bikeMass / frameArea,
      friction: 0.5, filterGroupIndex: BIKE_GROUP, userData: "chassis"
    });

    function makeWheel(axlePos, axisDir, travel) {
      var pos = add(origin, axlePos);
      var wheel = makeBody(world, "dynamic", pos, "wheel");
      wheel.createFixture({
        shape: pl.Circle(R), density: CONFIG.wheelMass / (Math.PI * R * R),
        friction: CONFIG.wheelGrip, restitution: 0,
        filterGroupIndex: BIKE_GROUP, userData: "wheel"
      });
      // Wheel joint = suspension spring + damper along the fork/shock line,
      // and a motor (engine on the rear, brakes on both)
      var joint = world.createJoint(pl.WheelJoint({
        enableMotor: false, maxMotorTorque: 0, motorSpeed: 0,
        frequencyHz: CONFIG.suspensionStiffness, dampingRatio: CONFIG.suspensionDamping
      }, chassis, wheel, pos, v(axisDir)));
      // Hard stops at both ends of the travel (two "ropes" along the axis:
      // one stops the wheel dropping too far, one stops it squashing too far)
      var local = Vec2(axlePos.x, axlePos.y), ax = Vec2(axisDir.x, axisDir.y);
      world.createJoint(pl.RopeJoint({
        bodyA: chassis, bodyB: wheel, localAnchorB: Vec2(0, 0),
        localAnchorA: Vec2(local.x - ax.x, local.y - ax.y), maxLength: 1 + 0.03
      }));
      world.createJoint(pl.RopeJoint({
        bodyA: chassis, bodyB: wheel, localAnchorB: Vec2(0, 0),
        localAnchorA: Vec2(local.x + ax.x, local.y + ax.y), maxLength: 1 + travel
      }));
      return { wheel: wheel, joint: joint, travel: travel, axis: axisDir };
    }

    var rear = makeWheel(GEO.rearAxle, GEO.rearAxis, CONFIG.rearTravel);
    // The engine's flywheel and gears make the rear wheel much harder to
    // spin up than the wheel alone (this is what real bikes feel like)
    rear.wheel.setMassData({ mass: CONFIG.wheelMass, center: Vec2(0, 0), I: CONFIG.drivetrainInertia });
    var front = makeWheel(GEO.frontAxle, GEO.frontAxis, CONFIG.frontTravel);

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
      crashed: false
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

  // --- Copy slider values (grip, bounce) onto the live bike ---
  function applyTuning(bike, surfaceFriction, bounce) {
    [bike.rear.wheel, bike.front.wheel].forEach(function (w) {
      var f = w.getFixtureList();
      f.setFriction(CONFIG.wheelGrip * surfaceFriction);
      f.setRestitution(bounce);
    });
  }

  // --- Copy suspension sliders onto the springs. Called every step. ---
  // Planck measures spring speed against the wheel's own weight, but each
  // spring really holds up half the bike + rider, so convert the numbers.
  function suspension(bike) {
    var sprung = (CONFIG.bikeMass + CONFIG.riderMass) / 2;
    [bike.rear, bike.front].forEach(function (s) {
      var mEff = 1 / (1 / bike.chassis.getMass() + 1 / s.wheel.getMass());
      var scale = Math.sqrt(sprung / mEff);
      s.joint.setSpringFrequencyHz(CONFIG.suspensionStiffness * scale);
      s.joint.setSpringDampingRatio(CONFIG.suspensionDamping * scale);
    });
  }

  // --- Throttle control: like a real rider easing off the gas when the
  // front wheel comes up too high, so holding gas doesn't flip you over.
  // Returns 0..1 (how much engine power to use).
  function throttleControl(bike) {
    // Only for a real wheelie: front wheel up for a moment, rear on the ground
    if (!bike.rearOnGround || bike.frontAir < 8) return 1;
    // How far the nose is pointing up, compared to "level" for gravity
    var g = bike.world.getGravity();
    var down = Math.atan2(g.y, g.x) - Math.PI / 2;
    var a = bike.chassis.getAngle() - down;
    var noseUp = -Math.atan2(Math.sin(a), Math.cos(a));
    // Look a moment ahead: a fast-rising front wheel needs easing off sooner
    noseUp += Math.max(0, -bike.chassis.getAngularVelocity()) * 0.25;
    var start = CONFIG.wheelieLimit - 0.35;
    if (noseUp <= start) return 1;
    return Math.max(0, 1 - (noseUp - start) / 0.35);
  }

  // --- Apply player controls. Called once per physics step. ---
  // input: { gas, brake, leanBack, leanForward }
  function control(bike, input) {
    var R = CONFIG.wheelRadius;
    var c = bike.chassis;
    var vel = c.getLinearVelocity();
    var fwd = c.getWorldVector(Vec2(1, 0));
    var forwardSpeed = vel.x * fwd.x + vel.y * fwd.y;
    var rearSpin = bike.rear.joint, frontSpin = bike.front.joint;

    if (input.gas) {
      // Engine drives the rear wheel up to top speed
      rearSpin.enableMotor(true);
      // Gearbox: the wheel can only spin a bit faster than the bike is moving
      var groundSpeed = forwardSpeed > 0 ? Math.hypot(vel.x, vel.y) : 0;
      var gearSpeed = Math.min(CONFIG.topSpeed, groundSpeed + CONFIG.gearSlip);
      rearSpin.setMotorSpeed(gearSpeed / R);
      rearSpin.setMaxMotorTorque(CONFIG.enginePower * throttleControl(bike));
      frontSpin.enableMotor(false);
    } else if (input.brake) {
      if (forwardSpeed > 0.5) {
        // Brakes on both wheels
        rearSpin.enableMotor(true); rearSpin.setMotorSpeed(0); rearSpin.setMaxMotorTorque(CONFIG.brakeTorque);
        frontSpin.enableMotor(true); frontSpin.setMotorSpeed(0); frontSpin.setMaxMotorTorque(CONFIG.brakeTorque);
      } else {
        // Nearly stopped: reverse
        rearSpin.enableMotor(true);
        rearSpin.setMotorSpeed(-CONFIG.reverseSpeed / R);
        rearSpin.setMaxMotorTorque(CONFIG.enginePower * 0.5);
        frontSpin.enableMotor(false);
      }
    } else {
      // Coasting: a little engine braking on the rear wheel
      rearSpin.enableMotor(true); rearSpin.setMotorSpeed(0); rearSpin.setMaxMotorTorque(12);
      frontSpin.enableMotor(false);
    }

    var lean = (input.leanForward ? 1 : 0) - (input.leanBack ? 1 : 0);

    // The rider shifts their weight (real physics through the hip joint)
    var target = lean * CONFIG.riderLeanAngle;
    if (bike.hips) {
      // Shift weight smoothly (a real rider can't throw their body instantly)
      var leanSpeed = (target - bike.hips.getJointAngle()) * 10;
      bike.hips.setMotorSpeed(Math.max(-CONFIG.riderLeanSpeed, Math.min(CONFIG.riderLeanSpeed, leanSpeed)));
    }

    // Extra turning so flips are possible, capped at a top spin speed
    if (lean !== 0) {
      var wSpin = c.getAngularVelocity();
      if (!(Math.abs(wSpin) >= CONFIG.maxSpinSpeed && Math.sign(wSpin) === lean)) {
        var strength = CONFIG.leanStrength * (onGround(bike) ? CONFIG.groundLeanFactor : 1);
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

  function updateContacts(bike) {
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

  function drawWheel(ctx, w) {
    var R = CONFIG.wheelRadius;
    inBodySpace(ctx, w, function () {
      if (ready(images.wheel)) ctx.drawImage(images.wheel, -R, -R, 2 * R, 2 * R);
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
    ctx.strokeStyle = "#2b1a3d"; ctx.lineWidth = 0.11;
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(elbow.x, elbow.y); ctx.lineTo(grip.x, grip.y); ctx.stroke();
    ctx.strokeStyle = "#e8742a"; ctx.lineWidth = 0.035; // jersey stripe
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
    drawWheel(ctx, bike.rear.wheel);
    drawWheel(ctx, bike.front.wheel);

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
    letGo: letGo,
    updateContacts: updateContacts,
    applyTuning: applyTuning,
    onGround: onGround,
    loadArt: loadArt,
    draw: draw
  };
})();
