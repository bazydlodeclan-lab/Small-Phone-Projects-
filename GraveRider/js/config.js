// =====================================================
// GRAVE RIDER — ALL TUNABLE PHYSICS VALUES
// Change numbers here to change how the bike feels.
// (The in-game tuning panel, opened with T, edits the
//  values marked "slider" while you play.)
// =====================================================
var CONFIG = {
  // --- World ---
  gravity: 1.0,              // slider: base gravity strength (1 = normal)
  physicsStepMs: 1000 / 60,  // fixed physics step (same feel on every computer)

  // --- Engine and brakes ---
  enginePower: 0.04,         // slider: how fast the rear wheel spins up per step
  maxWheelSpeed: 0.8,        // top rear-wheel spin speed
  reversePower: 0.02,        // spin-up when reversing
  maxReverseSpeed: 0.2,      // top reverse wheel speed
  brakeStrength: 0.25,       // how hard the brake slows the wheels (0-1)

  // --- Leaning / flips ---
  leanStrength: 0.0085,      // slider: how fast leaning spins the bike in the air
  groundLeanFactor: 0.35,    // leaning on the ground is this fraction of air leaning
  maxSpinSpeed: 0.12,        // fastest the bike is allowed to rotate (per step)
  airSpinDamping: 0.96,      // spin slowly fades when you let go of lean in the air

  // --- Suspension ---
  suspensionStiffness: 0.08, // slider: how stiff the springs are (higher = harder)
  suspensionDamping: 0.4,    // how quickly springs stop bouncing
  suspensionTravel: 14,      // how far (pixels) a wheel can be pushed up before it hits the stop

  // --- Tyres ---
  wheelGrip: 1.0,            // slider: tyre grip on the ground
  wheelRadius: 19,

  // --- Bike size / weight ---
  wheelBase: 92,             // distance between the wheel centres
  chassisDensity: 0.0018,
  wheelDensity: 0.0025,
  maxPartSpeed: 20,          // speed limit for every bike part (stops wheels punching through the ground)

  // --- Camera ---
  cameraLookAhead: 14,       // how far the camera looks ahead per unit of speed
  cameraMaxLookAhead: 260,
  cameraSmoothing: 0.08,     // 0-1, higher = camera snaps faster

  // --- Gameplay ---
  crashRestartDelayMs: 1000,
  flipPoints: 500,           // points per full flip
  flipLandingSlack: 0.5      // how far short of upright (radians) a flip still counts
};

// Default copy of the slider values (used by the tuning panel's reset button)
var CONFIG_DEFAULTS = JSON.parse(JSON.stringify(CONFIG));
