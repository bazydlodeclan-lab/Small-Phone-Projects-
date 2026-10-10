# Grave Rider — project notes

## Game summary
Grave Rider is a 2D physics dirt bike game that runs in the browser. It is a
Halloween art project, due in about 4 weeks (Week 1 started 2026-10-08).
All names and art are original.

The finished game has 4 levels, played in this order:

| # | Level   | Physics idea                                           |
|---|---------|--------------------------------------------------------|
| 1 | Skull   | Normal physics. Tutorial level.                        |
| 2 | Pumpkin | Bouncy pumpkins work as trampolines.                   |
| 3 | Moon    | Low gravity.                                           |
| 4 | Bat     | Gravity-flip zones: you ride on the ceiling.           |

## Current direction (owner requests, 2026-10-08 and 2026-10-09) — "for now"
- The bike is modelled on the published specs of a real electric MX bike (Stark VARG
  MX 1.2, 80 hp) with a 6 ft / 180 lb rider: see `js/config.js` for every number and
  its source. The brand name and its photos are NOT used in the game (trademark/copyright).
- Physics: as close to real life as possible. Throttle help defaults to 0 (real
  life), a little flip assist (in the air only), both adjustable in the T panel.
- Look: "completely normal theme for now" — neutral, daytime, no Halloween theme,
  no low gravity. The themed level ideas below are on hold; ask the owner before
  adding themes or special physics back.

## HARD SCOPE LIMIT (locked 2026-10-09)
The game is: **4 levels and a time trial.** Nothing else:
- a timer that starts on your first control press,
- a flip bonus (each full flip takes `flipTimeBonus` = 0.5 s off your time),
- your best time per level (saved in the browser), checkpoint splits and the finish
  compared with your best, and a ghost bike of your best run,
- a finish screen with stats of the ride.
Your time is the score (lower is better).

The owner approved the best time / ghost / stats extras on 2026-10-09 and asked to
lock the scope after them. NO shop, NO upgrades, NO extra bikes, NO other features.
If the owner asks for an extra feature, remind them of this limit before doing
anything, and suggest finishing the 4 levels first.

## Weekly plan
- **Week 1:** bike physics + test level. *(done — see "Week 1 status")*
- **Week 2:** build all 4 levels (Skull, Pumpkin, Moon, Bat).
- **Week 3:** art, sound, title screen.
- **Week 4:** buffer, publish on GitHub Pages, record a gameplay video.

## How to run
Double-click `index.html`. No server, no install, works offline
(Planck.js is stored locally in `lib/`).

Controls: Up/W gas · Down/S brake, then reverse once stopped · Left/A lean back ·
Right/D lean forward · R restart level · T tuning panel.
Technique (real physics): lean forward FIRST, then open the throttle, or the bike
loops out. In the air, throttle lifts the nose and brake drops it.

## How the code is organized
Plain `<script>` files (no ES modules) so the game works from `file://`.
Load order in `index.html` matters: planck → config → levels → bike → game.

| File | What it does |
|------|--------------|
| `index.html` | The page: canvas, tuning panel HTML/CSS, script tags. |
| `lib/planck.min.js` | Planck.js 1.5.0 physics engine (MIT license; a JavaScript port of Box2D). Official npm build. |
| `js/config.js` | `CONFIG`: every physics number in real units (m, kg, s, N, N·m, W), each tagged [SPEC], [MEASURED] or [ESTIMATE]. `CONFIG_DEFAULTS` is a copy used by the panel's Reset button. `ART`: the picture file for each part. |
| `js/levels.js` | `Shapes` helpers (line, hills, curve, kicker, join) and the `LEVELS` array. |
| `js/bike.js` | `Bike`: builds the bike (chassis, 2 wheels on wheel joints, rider body on a hip joint), controls (motor, traction control, throttle help, brakes, reverse, lean, flip assist), suspension (springs, bottoming cushion, anti-squat), crash let-go, ground contact + drive force, drawing from a "pose" (so the ghost uses the same drawing). |
| `js/game.js` | `Game`: fixed-timestep loop (60 Hz), level loading, terrain (Planck chain shapes), physics zones, race flow (ready → playing → crashed/finished), flips, ride stats, checkpoint splits, `Records` (best times in localStorage, wrapped in try/catch), ghost recording/playback, camera, input, drawing, HUD, finish screen. Also `Tuning` (the T panel: sliders, Copy settings, Reset, Clear best times). |
| `art/` | `bike.svg`, `wheel.svg` (front), `rear-wheel.svg`, `rider.svg`, `dirt.svg` + `art/README.md` with exact sizes and guide points for replacing them. |
| `tests/run-tests.js` | Automated Playwright tests (50 checks) with screenshots in `tests/screenshots/` (git-ignored). Run: `node tests/run-tests.js` from this folder. |
| `tests/physics-report.js` | Runs physics experiments (sag, drops, acceleration, braking, hill climbs, reversing, leaning, throttle/brake in the air) and writes `PHYSICS_REPORT.md`. Re-run after changing `config.js`. |

### Level data format (`js/levels.js`)
```
{
  name, groundColor, groundTopColor,
  physics: { gravityScale, gravityDir: {x, y}, bounce, friction },  // all optional
  start: {x, y}, checkpoints: [{x, y}], finish: {x},
  fallLimitY,          // falling below this = crash (fallLimitTopY also supported)
  terrain: [ [points...], { points: [...], solidAbove: true }, ... ],
  zones: [ { x, y, w, h, label, color, physics: { ...same keys as level physics } } ]
}
```
- Level coordinates are **pixels**, **y grows downward**. Physics converts them to
  metres with `CONFIG.pixelsPerMetre` (64 px = 1 m). The bike is 1.48 m between axles.
- Each terrain piece is one continuous ground line (a Planck chain shape, so no
  bumps at the joins); a gap between pieces is a hole.
  `solidAbove: true` only changes drawing (fills above the line, for ceilings — Bat level).
- Physics in use = defaults → level `physics` → the zone the bike is in.
  `gravityScale` multiplies 9.81 m/s² × `CONFIG.gravity`; `friction` multiplies
  `CONFIG.wheelGrip`; `bounce` is set on the tyres (0 = none, 1 = very bouncy).
  Known limit: Planck keeps a contact's friction from when it started, so a zone's
  `friction` only applies once a tyre leaves the ground and lands again (owner said
  no grip features for now).
- Design jumps for real scale: at 15 m/s a steep "kicker" lip launches the bike very
  high and spins it. Gentle ramps and tabletops ride better; hills over ~40° are hard.

### Physics notes (important for future changes)
- Real-world units and masses: 118 kg bike (97 kg chassis + 9 kg front / 12 kg rear
  wheel), 90 kg rider in gear (6 ft / 180 lb + ~8.5 kg gear), 9.81 m/s². Real
  geometry: 1.487 m wheelbase, 27.3° rake, 310/303 mm travel, MX tyres 80/100-21 and
  110/90-19 (radii 0.347/0.340 m). See `GEO` in bike.js.
- `planck.Settings.maxRotation` is raised to π per step (game.js). Planck's default
  caps any body at 94 rad/s, below the rear wheel's 118 rad/s at top speed; the
  capped wheel leaked the motor's push into the frame (fake flips, 116 km/h cap).
- Motor: rear WheelJoint motor. Torque = min(978 N·m, 60 kW ÷ wheel speed), single
  speed, max wheel speed = 145 km/h. `drivetrainInertia` 0.8 kg·m² (wheel + a little
  motor) gives realistic in-air throttle/brake pitch (~1 rad/s).
- Grip: `wheelGrip` IS the friction coefficient (0.85, packed dirt). Planck mixes
  friction as √(tyre × ground) and the ground is 1, so `applyTuning` sets the tyre to grip².
- Air drag (½ρ·CdA·v²) on the chassis and rolling resistance on wheels in contact:
  `Bike.resistance()`.
- Suspension: Planck `WheelJoint` springs (implicit = stable). `Bike.suspension()`
  converts real spring rates (N/m) and damping ratios into Planck's terms: Planck
  rates a spring against the mass it sees along the suspension line — chassis +
  wheel + the chassis turning (lever² ÷ inertia). Leaving the turning part out made
  the springs only 74% (rear) / 88% (front) as stiff as set. Factory springs for a
  198 lb rider in gear (fork 2 × 5.0 N/mm, shock 58 N/mm ≈ 8.7 N/mm at the wheel)
  give ~96 mm rear sag standing and ~33 mm bike-only. Preload = the spring's rest
  point is set beyond full extension. Two `RopeJoint`s per wheel are the hard stops, plus a
  bottoming cushion (last 15% of travel, 8× stiffer). The rear wheel slides on a
  straight line (no swingarm/chain), so `antiSquat` (0.85; the slider's tilt adds
  ~18%, so ~100% total) adds the chain + swingarm force that stops the rear squatting
  under acceleration (from the measured drive force).
- Wheelies (real physics): the front starts to lift when grip nears (rear tyre →
  centre of mass distance ÷ its height): ≈0.87 neutral, ≈1.0 leaning forward. As the
  front unloads the fork extends and tips the nose up further, so with grip 0.85
  neutral full throttle loops out in ~1 s, while leaning forward first holds the
  front down (pressing gas and lean together still lifts it: the shift takes ~0.35 s).
- Throttle: traction control (the real bike has it) keeps rear wheelspin ≤ 3 m/s.
  `throttleControl` = rider throttle help, 0..1, default 0 (real life); it eases the
  throttle in steep wheelies and holds it steady in the air. When the rear wheel
  lifts under braking the front brake is eased and the rear brake let go (locking
  the lifted, spinning rear wheel throws its spin into the frame: endo). Down: brakes, then reverse once
  stopped (4 m/s, 500 N·m — a game choice; facing downhill it can back up ~15°).
- The rider is one body (whole-body mass and inertia set with `setMassData`: centre
  0.84 m above the pegs, I 12.5 kg·m²) on a "legs" joint at the footpegs (a Planck
  WheelJoint): a spring + damper along the bike's up/down line (legs bending, 15 kN/m,
  fully damped, preloaded so the rider stands in the attack position; ropes limit it
  to 14 cm of crouch and 15 cm of stretch), and its motor turns the rider to lean.
  The rider picture squashes so the boots stay on the pegs. A landing over
  `riderMaxG` (10 g, measured on the rider) throws the rider off: a 2 m drop to flat
  is ~5 g, 4 m ~11 g. Lean = real
  weight shift: forward and back 0.20 rad (0.17 m), ~0.35 s to shift.
  In the air that alone turns the bike only ~8°/s. `flipAssist` (250 N·m, air only,
  capped at `maxSpinSpeed` 4 rad/s) adds a little turning; 0 = real life. A backflip
  needs a freestyle-style ramp: ~43° lip, ~2 m tall, ~32 mph take-off, a landing
  ramp ~15 m away and a long landing. The test track's double is too short: the
  speed a flip needs overshoots its landing onto the flat (too hard a landing). The rider leans back
  automatically when braking hard.
- Crash = rider's head or torso touching the ground, a landing over `riderMaxG`, or
  falling below the level.
  On a crash the hip joint is destroyed so the rider falls off, and 1 s later the
  bike restarts at the last checkpoint. The clock keeps running.
- Race flow (`state.mode`): ready (clock at 0, rider holds the brakes) → playing on
  the first control press → crashed / finished. Crash is checked before the finish
  each step: crash before or on the same step as the finish = crash; after the finish
  crashes are ignored and the rider brakes to a stop (no reverse).
- A wheel counts as "on the ground" if it touched in the last 3 steps. For jumps,
  flips, air time and flip assist the bike is "in the air" only when neither wheel
  nor the frame touches the ground (`Bike.touching`).
- Flips: while in the air, the lowest and highest angle are tracked relative to the
  nearest "upright". The moment the bike has turned a full turn (within `flipSlack`)
  that flip counts and takes `flipTimeBonus` off the time; each further full turn
  counts again. A flip you are still in when you crash gives nothing. Negative angle
  = backflip. If a wheel brushes something while the bike is more than 90° from
  upright, the flip in progress keeps counting.
- Your time = clock − flip bonus. Best runs are saved per level name under
  `graveRider.best.v1.<name>` (time, checkpoint splits, ghost frames; damaged
  records are ignored). Runs where any tuning slider was off its default at any
  point (`state.tunedRun`) are not saved. The clock counts whole physics steps. Ghost: every 2nd step the
  pose of chassis, wheels and rider is recorded; playback blends between frames
  (not across a crash respawn).
- Camera moves once per physics step (same feel at 60 and 144 Hz).
- Level design at this bike's speed: it reaches ~85 km/h on short straights, so
  hill faces become launch ramps — leave run-out room and give jumps long landings.

## Week 1 status
Done: physics engine Planck.js; bike modelled on real electric MX bike specs (motor
torque/power curve, real geometry, suspension, brakes, drag, anti-squat, traction
control) with a researched 6 ft / 180 lb rider; real-life wheelie behaviour; reverse;
level system with zones; test level ("Test Track"); time-trial flow (clock starts on
first input, crash/finish rules, live flip counting with time bonus); HUD with speed,
best time and checkpoint splits; ghost of your best run; finish screen with ride
stats; rider legs that soak up landings (too-hard landings crash); camera; tuning
panel; swappable art; physics report; 50/50 automated tests.

Known things to handle in Week 2:
- Build the 4 levels with the "normal theme for now" look (ask before adding themes).
- Levels for real riding: give the rider room to lean forward before throttling,
  build flip jumps as freestyle ramps (steep ~43° lip, landing ramp ~15 m away, long
  landing; ~32 mph take-off), never land big jumps onto flat ground, and
  watch hill faces over ~35° (a standstill climb fails at 40° on 0.85 grip).
- Bat level (if it stays): gravity pointing up — check crash detection, throttle
  help (uses the slope under the rear tyre), flip counting and camera framing.
- The test level is a placeholder; replace it with the 4 real levels.
- Final art (Week 3): replace the files in `art/` following `art/README.md`.
