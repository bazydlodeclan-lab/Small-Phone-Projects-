// =====================================================
// GRAVE RIDER — ALL TUNABLE PHYSICS VALUES
// Change numbers here to change how the bike feels.
// (The in-game tuning panel, opened with T, edits the
//  values marked "slider" while you play.)
//
// Physics uses real-world units: metres, kilograms,
// seconds. The screen shows PIXELS_PER_METRE pixels
// for every metre.
// =====================================================
var CONFIG = {
  // --- World ---
  pixelsPerMetre: 64,
  gravity: 1.0,              // slider: gravity strength (1 = Earth, 9.81 m/s²)
  physicsStepSec: 1 / 60,    // fixed physics step (same feel on every computer)

  // --- Engine and brakes (real dirt bike numbers) ---
  enginePower: 330,          // slider: rear wheel torque in N·m
  topSpeed: 21,              // top speed in metres per second (about 75 km/h)
  reverseSpeed: 3,           // reverse speed in m/s
  brakeTorque: 900,          // brake strength in N·m (both wheels)
  wheelieLimit: 0.9,         // engine eases off as a wheelie gets this steep (radians)
  drivetrainInertia: 2.5,    // how hard the rear wheel + engine are to spin up (kg·m²)
  gearSlip: 3,               // how much faster than the bike (m/s) the rear wheel may spin

  // --- Leaning / flips ---
  // The rider shifting their weight turns the bike a little (real physics).
  // Lean strength adds extra turning so flips are possible in a game.
  leanStrength: 1400,        // slider: extra turning force in the air (N·m)
  groundLeanFactor: 0.45,    // leaning on the ground is this fraction of air leaning
  maxSpinSpeed: 7,           // fastest the bike is allowed to rotate (radians/sec)
  riderLeanAngle: 0.35,      // how far the rider leans back/forward (radians)
  riderStrength: 4000,       // how firmly the rider holds their position (N·m)
  riderLeanSpeed: 2,         // how fast the rider shifts their weight (radians/sec)

  // --- Suspension ---
  suspensionStiffness: 3.2,  // slider: spring speed in Hz (higher = harder)
  suspensionDamping: 0.6,    // 0 = bouncy forever, 1 = no bounce at all
  rearTravel: 0.22,          // how far the rear wheel can move up (metres)
  frontTravel: 0.24,         // how far the front wheel can move up (metres)

  // --- Tyres ---
  wheelGrip: 1.1,            // slider: tyre grip (rubber on dirt is about 1)
  wheelRadius: 0.34,         // metres

  // --- Weights (kg) ---
  bikeMass: 105,
  wheelMass: 9,
  riderMass: 75,

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
  bike:  "art/bike.svg",   // frame, engine, seat, plastics (no wheels)
  wheel: "art/wheel.svg",  // one wheel, spins
  rider: "art/rider.svg",  // rider without arms (arms are drawn to the handlebar)
  dirt:  "art/dirt.svg"    // ground texture, repeats
};
