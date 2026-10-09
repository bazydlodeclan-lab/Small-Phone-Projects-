// =====================================================
// GRAVE RIDER — ALL PHYSICS VALUES
// The bike is modelled on a real electric motocross bike
// (published specs of the 2025/26 Stark VARG MX 1.2, 80 hp
// version). The brand is not shown in the game.
//
//   [SPEC]     = published manufacturer / magazine figure
//   [MEASURED] = from an independent test
//   [ESTIMATE] = not published; a typical value for this
//                kind of bike (change it if you find the
//                real number)
//
// Units: metres, kilograms, seconds, newtons (N), N·m.
// The in-game tuning panel (press T) edits the values
// marked "slider" while you play.
// =====================================================
var CONFIG = {
  // --- World ---
  pixelsPerMetre: 64,
  gravity: 1.0,              // slider: gravity strength (1 = Earth, 9.81 m/s²)
  physicsStepSec: 1 / 60,    // fixed physics step (same feel on every computer)
  airDensity: 1.225,         // kg/m³ at sea level

  // --- Electric motor (single speed, chain drive, no gearbox) ---
  motorPower: 60000,         // slider: peak power in watts — 80 hp [SPEC]
  wheelTorque: 978,          // peak torque at the rear wheel, N·m [SPEC: MX 1.2 table; older pages say 938]
  topSpeed: 40.3,            // m/s (145 km/h / 90 mph) with stock gearing [MEASURED: one hands-on test]
  reverseSpeed: 4,           // m/s top speed backwards (hold brake once stopped) [GAME CHOICE]
  reverseTorque: 500,        // N·m at the rear wheel when reversing: enough to back up a steep hill [GAME CHOICE]
  drivetrainInertia: 0.8,    // rear wheel + tyre + sprocket (+ a little motor) spinning inertia, kg·m² [ESTIMATE: wheel ≈ 0.7]

  // --- Brakes (rider uses front + rear together) ---
  frontBrakeTorque: 1000,    // 260 mm disc, 2-piston caliper, N·m [ESTIMATE from disc size]
  rearBrakeTorque: 450,      // 220 mm disc, 1-piston caliper, N·m [ESTIMATE from disc size]

  // --- Resistance ---
  dragArea: 0.55,            // drag coefficient × frontal area, bike + standing rider, m² [ESTIMATE]
  rollingResistance: 0.03,   // knobby tyres on dirt [ESTIMATE]

  // --- Throttle ---
  // Traction control (the real bike has it): cuts power when the rear tyre
  // spins too much faster than the bike is moving.
  tractionControl: true,
  maxWheelspin: 3,           // m/s the rear tyre may spin faster than the bike [ESTIMATE]
  // Rider throttle help (slider, 0..1). A key is only on/off, so this eases
  // the throttle for you when the front wheel comes up too high, and holds it
  // steady in the air. 0 = real life: full throttle without leaning forward
  // loops the bike out, just like the real thing. 1 = full help.
  throttleControl: 0,
  wheelieLimit: 0.5,         // wheelie angle (radians, about 29°) where full help backs off completely

  // --- Leaning ---
  // Real physics: the rider shifting their weight on the pegs moves the bike
  // only a little in the air (angular momentum is conserved). Leaning
  // forward on the ground keeps the front wheel down (real weight shift).
  // flipAssist adds a little extra turning IN THE AIR ONLY so flips are
  // possible in a game. flipAssist = 0 is fully realistic.
  flipAssist: 250,           // slider: extra turning force in the air (N·m); 0 = real life
  maxSpinSpeed: 4,           // assist stops adding spin above this (radians/sec; one backflip needs about 3)
  // A real rider can move their weight about 0.17 m forward (chest over the
  // bars) and 0.20 m back (hanging off the back) [ESTIMATE: body-segment model]
  riderLeanForward: 0.20,    // radians at the pegs (0.20 × 0.84 m = 0.17 m)
  riderLeanBack: 0.24,       // radians (0.24 × 0.84 m = 0.20 m)
  riderStrength: 4000,       // how firmly the rider holds their position (N·m) [ESTIMATE]
  riderLeanSpeed: 0.8,       // weight shift speed: neutral to full lean in about 0.35 s [ESTIMATE]

  // --- Suspension (KYB 48 mm fork + KYB shock) ---
  frontTravel: 0.310,        // fork travel, m [SPEC]
  rearTravel: 0.303,         // rear wheel travel, m [SPEC]
  frontSpringRate: 9200,     // both fork springs together, N/m along the fork [ESTIMATE: typical 4.6 N/mm ×2]
  rearSpringRate: 8800,      // at the wheel, N/m [ESTIMATE: gives about 100 mm sag with a 75 kg rider]
  frontPreload: 0.016,       // spring pre-compression at full extension, m [ESTIMATE]
  rearPreload: 0.044,        // m [ESTIMATE]
  frontDamping: 0.55,        // fraction of "no bounce" damping (1 = no bounce) [ESTIMATE]
  rearDamping: 0.6,          // [ESTIMATE]
  suspensionStiffness: 1.0,  // slider: multiplies both spring rates (1 = stock)
  bottomingStiffness: 8,     // last 15% of travel is this many times stiffer [ESTIMATE]
  antiSquat: 1.0,            // share of the accelerating weight shift the chain + swingarm hold up (1 = 100%) [ESTIMATE: typical MX]

  // --- Tyres (90/90-21 front, 140/80-18 rear) ---
  wheelGrip: 0.85,           // slider: friction coefficient, knobby tyre on packed dirt [ESTIMATE: 0.8-1.0]
  frontWheelRadius: 0.348,   // from tyre size 90/90-21 [SPEC → calculated]
  rearWheelRadius: 0.341,    // from tyre size 140/80-18 [SPEC → calculated]

  // --- Weights (kg) ---
  bikeMass: 118,             // whole bike including wheels [SPEC]
  frontWheelMass: 9,         // wheel + tyre + disc [ESTIMATE]
  rearWheelMass: 13,         // wheel + tyre + disc + sprocket [ESTIMATE]
  riderMass: 90,             // 6 ft, 180 lb (81.6 kg) rider + about 8.5 kg of MX gear [ESTIMATE: gear listings]

  // --- Camera ---
  cameraLookAhead: 0.45,     // how far the camera looks ahead (seconds of travel)
  cameraMaxLookAhead: 260,   // pixels
  cameraSmoothing: 0.08,     // 0-1, higher = camera snaps faster

  // --- Gameplay ---
  crashRestartDelayMs: 1000, // after a crash you restart at the last checkpoint (the clock keeps running)
  flipTimeBonus: 0.5,        // seconds taken off your time for each full flip
  flipSlack: 0.5,            // a flip counts this far (radians, about 29°) short of a full turn
  speedUnit: "mph"           // speedometer: "mph" or "km/h"
};

// Default copy of the slider values (used by the tuning panel's reset button)
var CONFIG_DEFAULTS = JSON.parse(JSON.stringify(CONFIG));

// =====================================================
// ART — every picture the game uses. To change the look,
// replace the file (keep the same name) or point to a new
// one here. See art/README.md for the exact sizes.
// =====================================================
var ART = {
  bike:      "art/bike.svg",       // frame, battery, motor, seat, plastics (no wheels)
  wheel:     "art/wheel.svg",      // front wheel, spins
  rearWheel: "art/rear-wheel.svg", // rear wheel (wider tyre, sprocket), spins
  rider:     "art/rider.svg",      // rider without arms (arms are drawn to the handlebar)
  dirt:      "art/dirt.svg"        // ground texture, repeats
};
