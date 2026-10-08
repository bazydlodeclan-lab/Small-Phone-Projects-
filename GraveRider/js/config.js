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
  reverseSpeed: 2,           // m/s — the real bike has no reverse; this is the rider walking it back
  drivetrainInertia: 3.2,    // rear wheel + motor spinning inertia at the wheel, kg·m² [ESTIMATE]

  // --- Brakes (rider uses front + rear together) ---
  frontBrakeTorque: 1000,    // 260 mm disc, 2-piston caliper, N·m [ESTIMATE from disc size]
  rearBrakeTorque: 450,      // 220 mm disc, 1-piston caliper, N·m [ESTIMATE from disc size]

  // --- Resistance ---
  dragArea: 0.55,            // drag coefficient × frontal area, bike + standing rider, m² [ESTIMATE]
  rollingResistance: 0.03,   // knobby tyres on dirt [ESTIMATE]

  // --- Rider throttle + brake control ---
  // A real rider feathers the throttle in a wheelie, holds it steady in the
  // air, and eases the front brake if the back wheel starts lifting. A key
  // is only on/off, so the game does this for you: power eases off as a
  // wheelie gets too steep, in the air the rear wheel only keeps pace with
  // the bike's speed, and the front brake eases off before an "endo".
  // Set to 0 to turn this off (much easier to loop out or go over the bars).
  throttleControl: 1,
  wheelieLimit: 0.5,         // wheelie angle (radians, about 29°) where the rider backs off fully
  maxWheelspin: 3,           // m/s the rear tyre may spin faster than the bike before the rider rolls off

  // --- Leaning ---
  // Real physics: the rider shifting their weight on the pegs moves the bike
  // only a little in the air (angular momentum is conserved).
  // flipAssist adds extra turning so flips are possible in a game.
  // flipAssist = 0 is fully realistic.
  flipAssist: 1400,          // slider: extra turning force (N·m); 0 = real life
  groundLeanFactor: 0.45,    // flip assist on the ground is this fraction of in the air
  maxSpinSpeed: 7,           // assist stops adding spin above this (radians/sec)
  riderLeanAngle: 0.35,      // how far the rider leans back/forward at the hips (radians)
  riderStrength: 4000,       // how firmly the rider holds their position (N·m) [ESTIMATE]
  riderLeanSpeed: 2,         // how fast the rider shifts their weight (radians/sec) [ESTIMATE]

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

  // --- Tyres (90/90-21 front, 140/80-18 rear) ---
  wheelGrip: 1.0,            // slider: knobby tyre on loose dirt [ESTIMATE]
  frontWheelRadius: 0.348,   // from tyre size 90/90-21 [SPEC → calculated]
  rearWheelRadius: 0.341,    // from tyre size 140/80-18 [SPEC → calculated]

  // --- Weights (kg) ---
  bikeMass: 118,             // whole bike including wheels [SPEC]
  frontWheelMass: 9,         // wheel + tyre + disc [ESTIMATE]
  rearWheelMass: 13,         // wheel + tyre + disc + sprocket [ESTIMATE]
  riderMass: 75,             // rider in full gear (change to your weight)

  // --- Camera ---
  cameraLookAhead: 0.45,     // how far the camera looks ahead (seconds of travel)
  cameraMaxLookAhead: 260,   // pixels
  cameraSmoothing: 0.08,     // 0-1, higher = camera snaps faster

  // --- Gameplay ---
  crashRestartDelayMs: 1000,
  flipPoints: 500,           // points per full flip
  flipLandingSlack: 0.5      // how far short of upright (radians) a flip still counts
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
