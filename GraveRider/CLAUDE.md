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
| 4 | Bat     | Loop-the-loops (changed from gravity flips: a 2D roll leaves the bike facing backward). |

## Current direction (owner requests, 2026-10-08 and 2026-10-09) — "for now"
- The bike is modelled on the published specs of a real electric MX bike (Stark VARG
  MX 1.2, 80 hp) with a 6 ft / 180 lb rider: see `js/config.js` for every number and
  its source. The brand name and its photos are NOT used in the game (trademark/copyright).
- Physics: as close to real life as possible. Throttle help defaults to 0 (real
  life), a little flip assist (in the air only), both adjustable in the T panel.
- Look: themed levels are ON (owner request 2026-10-12, overrides the earlier "normal
  theme for now"). Each level has a `theme` (sky, moon, hills, props; see `js/themes.js`).
  Levels are real motocross layouts without turns: whoops, tabletops, doubles, rollers.
- Assists: throttle assist and brake assist are on by default (front wheel stays down).
- Owner request 2026-10-12 (round 2): a hard landing NEVER throws the rider off any more
  (`CONFIG.hardLandingCrash = false`; head/torso touching the ground and falling out of the
  level still crash). Levels are about 2x longer (700-900 m, 50-80 s) with whoops, rhythm
  sections, tabletops, doubles, hills and ONE freestyle ramp each (a backflip is possible).
  The camera is zoomed out (900 px of height on screen) and looks lower when the bike is high,
  so the ground stays in view.

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
Right/D lean forward · R restart level · N next level · 1-4 pick a level · T tuning panel.
Technique (real physics): lean forward FIRST, then open the throttle, or the bike
loops out. In the air, throttle lifts the nose and brake drops it.

## How the code is organized
Plain `<script>` files (no ES modules) so the game works from `file://`.
Load order in `index.html` matters: planck → config → levels → bike → themes → game.

| File | What it does |
|------|--------------|
| `index.html` | The page: canvas, tuning panel HTML/CSS, script tags. |
| `lib/planck.min.js` | Planck.js 1.5.0 physics engine (MIT license; a JavaScript port of Box2D). Official npm build. |
| `js/config.js` | `CONFIG`: every physics number in real units (m, kg, s, N, N·m, W), each tagged [SPEC], [MEASURED] or [ESTIMATE]. `CONFIG_DEFAULTS` is a copy used by the panel's Reset button. `ART`: the picture file for each part. |
| `js/levels.js` | `Shapes` helpers (line, hills, curve, kicker, loop, join), `LevelBuilder` (relative pieces: flat/ramp/lip/ease/bump/hills/whoops/table/pad/loop/freestyle/checkpoint/speed) and the `LEVELS` array (4 levels; `TEST_TRACK` is tests only). |
| `js/themes.js` | `Themes`: level looks (background sky/moon/hills, props, pumpkin drawing) for the skull, pumpkin, moon and bat themes. |
| `js/bike.js` | `Bike`: builds the bike (chassis, 2 wheels on wheel joints, rider body on a hip joint), controls (motor, traction control, throttle help, brakes, reverse, lean, flip assist), suspension (springs, bottoming cushion, anti-squat), crash let-go, ground contact + drive force, drawing from a "pose" (so the ghost uses the same drawing). |
| `js/game.js` | `Game`: fixed-timestep loop (60 Hz), level loading, terrain (Planck chain shapes), physics zones, race flow (ready → playing → crashed/finished), flips, ride stats, checkpoint splits, `Records` (best times in localStorage, wrapped in try/catch), ghost recording/playback, camera, input, drawing, HUD, finish screen. Also `Tuning` (the T panel: sliders, Copy settings, Reset, Clear best times). |
| `art/` | `bike.svg`, `wheel.svg` (front), `rear-wheel.svg`, `rider.svg`, `dirt.svg` + `art/README.md` with exact sizes and guide points for replacing them. |
| `tests/run-tests.js` | Automated Playwright tests (69 checks) with screenshots in `tests/screenshots/` (git-ignored). Run: `node tests/run-tests.js` from this folder. |
| `tests/ride-levels.js` | Rides every level in `js/levels.js` with a test rider at 0.9 / 1.0 / 1.1 × its `testRide` speeds. Rules: finishes, 0 crashes, never stuck, 50 m run-out, and a hold-the-throttle rider is only reported (no longer a rule). It also prints flips and peak landing g (hard landings no longer crash). Run: `node tests/ride-levels.js` (or `node tests/ride-levels.js 1`). Run it after changing any level or the physics. |
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
  (Planck keeps a contact's friction from when it started, so `applyTuning` resets
  the tyres' existing contacts whenever grip or bounce changes.)
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
- Realism upgrades (all [ESTIMATE]s, tagged in config.js; the research job for them was
  cut off by the usage limit, so re-check them against sources when possible):
  tyre grip falls with slip (full grip to 4 m/s of slip, 75% sliding at 12 m/s — set per
  wheel contact each step in `Bike.tyreGrip`); motor power fades from 120 km/h to 70% at
  top speed; engine braking (regen, 100 N·m, fading to 0 at a standstill, ground only);
  rear linkage gets stiffer deeper in the stroke (`rearForceTable`, softer rear cushion).
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
  give ~95 mm rear / ~69 mm front sag with the rider standing and ~40 / 34 mm
  bike-only (measured with the wheels rolling free — locked brakes change it).
  Preload = the spring's rest point is set beyond full extension. Two `RopeJoint`s per wheel are the hard stops, plus a
  bottoming cushion (last 15% of travel, 8× stiffer). The rear wheel slides on a
  straight line (no swingarm/chain), so `antiSquat` (0.85; the slider's tilt adds
  ~18%, so ~100% total) adds the chain + swingarm force that stops the rear squatting
  under acceleration (from the measured drive force).
- Wheelies (real physics): the front starts to lift when grip nears (rear tyre →
  centre of mass distance ÷ its height): ≈0.87 neutral, ≈1.0 leaning forward. As the
  front unloads the fork extends and tips the nose up further, so with grip 0.85
  neutral full throttle loops out in ~1 s, while leaning forward first holds the
  front down (pressing gas and lean together still lifts it: the shift takes ~0.35 s).
- Rider assists (default ON, adjustable in the T panel; 0 = real life): `throttleControl` cuts
  the power as the front wheel unloads and the nose lifts compared with the slope (so the
  front wheel stays on the ground, even at full throttle with neutral lean) and holds the
  throttle steady in the air unless you lean back (going for a flip). `brakeAssist` keeps the
  rear wheel down (no stoppie) and stops a wheel locking (ABS-like).
- Throttle: traction control (the real bike has it) holds rear wheelspin at about
  3-3.5 m/s (its power share eases toward the target instead of switching each step).
  `throttleControl` = rider throttle help, 0..1, default 0 (real life); it eases the
  throttle in steep wheelies and holds it steady in the air. When the rear wheel
  lifts under braking (a stoppie) the rear brake is let go (locking the lifted,
  spinning wheel throws its spin into the frame) and the front brake eases right off
  as the nose drops, so the rear comes back down — upright from any speed, 60-145 km/h.
  Down: brakes, then reverse once stopped (4 m/s, 500 N·m — a game choice; facing
  downhill it backs up slopes to ~15°; on steeper downhills the front brake holds
  it still instead).
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
- Crash = rider's head or torso touching the ground, falling below the level, or (only if `hardLandingCrash` is on, default OFF) a landing over `riderMaxG`, or
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
  Leave about 50 m (3200 px) of flat after the finish line: the rider brakes to a
  stop there (from 90 km/h that takes ~45 m).
- Times are shown in whole hundredths, and differences (splits, finish vs best) are
  worked out from the shown times so they always add up.

## Week 1 status
Done: physics engine Planck.js; bike modelled on real electric MX bike specs (motor
torque/power curve, real geometry, suspension, brakes, drag, anti-squat, traction
control) with a researched 6 ft / 180 lb rider; real-life wheelie behaviour; reverse;
level system with zones; test level ("Test Track"); time-trial flow (clock starts on
first input, crash/finish rules, live flip counting with time bonus); HUD with speed,
best time and checkpoint splits; ghost of your best run; finish screen with ride
stats; rider legs that soak up landings (too-hard landings crash); camera; tuning
panel; swappable art; physics report; 63/63 automated tests.

Week 2 status: all 4 levels are built and pass `node tests/ride-levels.js` and
`node tests/run-tests.js` (69/69).
- Round 2 (2026-10-12): hard-landing crash removed, levels lengthened, `freestyle()` ramp
  (78 km/h take-off, steep kicker, wide gap, low landing ramp, long downhill; the test rider
  flips it at 0.9/1.0/1.1x), camera zoomed out. With no hard-landing crash, speed was always best,
  so low hanging beams were tried over the big jumps (hit one = crash). The owner did not like
  them and they were REMOVED (2026-10-16): holding the throttle is now the fastest way to ride;
  `tests/ride-levels.js` only reports it. Another speed limiter needs the owner's OK first.
- Best times are saved per level AND per map shape: the saved name has a fingerprint of the
  track (`Records.key` in game.js), so times from older versions of a level are not loaded.
- Level 1 Skull Hollow (normal, tutorial), Level 2 Pumpkin Patch (bounce pads: zones with
  `pad: true`, explicit bounce in `padBounce` in game.js), Level 3 Moon Crater (`gravityScale`
  0.4, very long landings), Level 4 Bat Cave (two loop-the-loops from `Shapes.loop`; the entry arc
  switches off once you are over the top, the exit arc only turns on then; hard-landing g is
  ignored inside a loop; loop radius 320 px works, 250 does not).
- Contacts switched off in pre-solve are ignored by the bike's ground checks (`ct.isEnabled()`).
- Level design rules that worked: relative pieces; long downhill landings; pads need long flat
  zones (2200 px) so the bounce chain ends inside the pad; 50 m run-out; checkpoint before jumps.
- Bike/realism values (tyre curve, power fade, regen, linkage) are estimates; research was cut off.
- Still to do: independent review of the assist/theme/loop code, touch controls, final art and
  sound (Week 3), GitHub Pages and a video (Week 4). Bikes, mods, shop = version 2.
- The Test Track (`TEST_TRACK`) is only for the automated tests, not part of the game.
- Final art (Week 3): replace the files in `art/` following `art/README.md`.
