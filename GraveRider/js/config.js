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
  wheelTorque: 978,          // peak torque at the rear wheel, N·m [SPEC: MX 1.2, stock 14/47 gearing; the older VARG MX was 938]
  topSpeed: 40.3,            // m/s (145 km/h / 90 mph) at the motor's limit, stock gearing [MEASURED: owner GPS and a magazine test;
                             // no factory figure. "106 mph" needs taller sprockets, not stock]
  reverseSpeed: 4,           // m/s top speed backwards (hold brake once stopped) [GAME CHOICE]
  reverseTorque: 500,        // N·m at the rear wheel when reversing: enough to back up a steep hill [GAME CHOICE]
  drivetrainInertia: 0.8,    // rear wheel + tyre + sprocket spinning inertia, kg·m² [ESTIMATE: wheel ≈ 0.8; the motor
                             // adds ~0.5 when speeding up but only ~0.04 to how the bike twists in the air]

  // --- Brakes (rider uses front + rear together) ---
  frontBrakeTorque: 750,     // 260 mm disc, 2-piston caliper, N·m [ESTIMATE: 560-910 from the caliper, disc and 12 mm
                             // master cylinder owners report; still more than the tyre can hold, so it can lock]
  rearBrakeTorque: 450,      // 220 mm disc, 1-piston caliper, N·m [ESTIMATE from disc size]

  // --- Resistance ---
  dragArea: 0.65,            // drag coefficient × frontal area, bike + standing rider, m² [ESTIMATE: 0.59 seated (magazine test) + standing]
  rollingResistance: 0.04,   // knobby tyres on packed dirt [ESTIMATE: 0.03-0.05; loose dirt 0.06-0.10]

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
  // bars) and 0.17 m back (hanging off the back) [ESTIMATE: body-segment model]
  riderLeanForward: 0.20,    // radians at the pegs (0.20 × 0.84 m = 0.17 m)
  riderLeanBack: 0.20,       // radians (0.20 × 0.84 m = 0.17 m)
  riderStrength: 4000,       // how firmly the rider is held in position on the pegs (N·m) [GAME CHOICE: this one joint
                             // stands in for feet, knees gripping the bike and hands on the bars; muscle alone is
                             // ~500-1200 N·m, but at 800 the rider falls off under ordinary hard braking]
  riderLeanSpeed: 0.8,       // weight shift speed: neutral to full lean in about 0.35 s [ESTIMATE]

  // --- Rider's legs ---
  // The rider soaks up landings by bending their knees: a spring + damper
  // between the pegs and the body. A landing harder than the legs can hold
  // throws the rider off (riderMaxG).
  legStiffness: 15000,       // N/m, both legs [ESTIMATE: human leg stiffness 7-40 kN/m when hopping]
  legDamping: 1.0,           // fraction of "no bounce" damping: muscles soak it up, no bounce [ESTIMATE]
  legCrouch: 0.14,           // m the body can drop from the attack position to a deep crouch [ESTIMATE: body-segment model]
  legStretch: 0.15,          // m it can rise with the legs straight [ESTIMATE: same model]
  riderMaxG: 10,             // landing harder than this (g, on the rider) throws them off [ESTIMATE: a 2 m drop to
                             // flat is ~4-8 g and rideable; 5 m is ~9-17 g, beyond what a rider can hold]

  // --- Suspension (KYB 48 mm fork + KYB shock) ---
  frontTravel: 0.310,        // fork travel, m [SPEC]
  rearTravel: 0.303,         // rear wheel travel, m [SPEC]
  frontSpringRate: 10000,    // both fork springs, N/m along the fork [SPEC: 5.0 N/mm springs, the factory choice for a 198 lb rider in gear]
  rearSpringRate: 8700,      // at the wheel, N/m [ESTIMATE: 58 N/mm shock (factory choice for 198 lb) through the linkage]
  frontPreload: 0.008,       // spring pre-compression at full extension, m [ESTIMATE]
  rearPreload: 0.0145,       // m [ESTIMATE: sets ~95 mm rider sag standing (~100-105 seated) and ~40 mm bike-only sag]
  frontDamping: 0.55,        // fraction of "no bounce" damping (1 = no bounce) [ESTIMATE]
  rearDamping: 0.6,          // [ESTIMATE]
  suspensionStiffness: 1.0,  // slider: multiplies both spring rates (1 = stock)
  bottomingStiffness: 8,     // last 15% of travel is this many times stiffer [ESTIMATE]
  antiSquat: 0.85,           // share of the accelerating weight shift the chain + swingarm hold up [ESTIMATE: with the
                             // ~18% the tilted rear slider already gives, ~100% total, the usual MX design target]

  // --- Tyres (80/100-21 front, 110/90-19 rear: the MX model's sizes) ---
  wheelGrip: 0.85,           // slider: friction coefficient, knobby tyre on packed dirt [ESTIMATE: 0.8-1.0]
  frontWheelRadius: 0.347,   // from tyre size 80/100-21 [SPEC → calculated]
  rearWheelRadius: 0.340,    // from tyre size 110/90-19 [SPEC → calculated]

  // --- Weights (kg) ---
  bikeMass: 118,             // whole bike including wheels [SPEC]
  frontWheelMass: 9,         // wheel + tyre + tube + disc [ESTIMATE: parts list ≈ 9.0]
  rearWheelMass: 12,         // wheel + tyre + tube + disc + sprocket [ESTIMATE: parts list ≈ 11.9]
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
