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

## Current direction (owner request, 2026-10-08) — "for now"
- The bike is modelled on the published specs of a real electric MX bike (Stark VARG
  MX 1.2, 80 hp): see `js/config.js` for every number and its source. The brand name
  and its photos are NOT used in the game (trademark/copyright).
- Look: neutral, no Halloween theme, daytime. Test level has no low-gravity zone.
- OPEN QUESTION for the owner: is this permanent (changes the 4 themed levels below)
  or only for the test track? Ask before building Week 2 levels.

## HARD SCOPE LIMIT
The game is: **4 levels, a timer, a flip bonus and a score.** Nothing else.

NO shop, NO upgrades, NO extra bikes, NO other features.
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

Controls: Up/W gas · Down/S brake (reverse when stopped) · Left/A lean back ·
Right/D lean forward · R restart level · T tuning panel.

## How the code is organized
Plain `<script>` files (no ES modules) so the game works from `file://`.
Load order in `index.html` matters: planck → config → levels → bike → game.

| File | What it does |
|------|--------------|
| `index.html` | The page: canvas, tuning panel HTML/CSS, script tags. |
| `lib/planck.min.js` | Planck.js 1.5.0 physics engine (MIT license; a JavaScript port of Box2D). Official npm build. |
| `js/config.js` | `CONFIG`: every physics number in real units (m, kg, s, N, N·m, W), each tagged [SPEC], [MEASURED] or [ESTIMATE]. `CONFIG_DEFAULTS` is a copy used by the panel's Reset button. `ART`: the picture file for each part. |
| `js/levels.js` | `Shapes` helpers (line, hills, curve, kicker, join) and the `LEVELS` array. |
| `js/bike.js` | `Bike`: builds the bike (chassis, 2 wheels on wheel joints, rider body on a hip joint), controls, throttle control, suspension tuning, crash let-go, ground contact detection, drawing with the art files. |
| `js/game.js` | `Game`: fixed-timestep loop (60 Hz), level loading, terrain (Planck chain shapes), physics zones, crash/checkpoint/finish, flip scoring, camera, input, drawing, HUD. Also `Tuning` (the T panel). |
| `art/` | `bike.svg`, `wheel.svg` (front), `rear-wheel.svg`, `rider.svg`, `dirt.svg` + `art/README.md` with exact sizes and guide points for replacing them. |
| `tests/run-tests.js` | Automated Playwright tests (21 checks) with screenshots in `tests/screenshots/` (git-ignored). Run: `node tests/run-tests.js` from this folder. |
| `tests/physics-report.js` | Runs physics experiments (sag, drops, acceleration, braking, hill climbs, leaning, throttle/brake in the air) and writes `PHYSICS_REPORT.md`. Re-run after changing `config.js`. |

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
- Design jumps for real scale: at 15 m/s a steep "kicker" lip launches the bike very
  high and spins it. Gentle ramps and tabletops ride better; hills over ~40° are hard.

### Physics notes (important for future changes)
- Real-world units and masses: 118 kg bike (96 kg chassis + 9 kg front / 13 kg rear
  wheel), 75 kg rider, 9.81 m/s². Real geometry: 1.487 m wheelbase, 27.3° rake,
  310/303 mm travel, 21"/18" wheels (radii 0.348/0.341 m). See `GEO` in bike.js.
- Motor: rear WheelJoint motor. Torque = min(978 N·m, 60 kW ÷ wheel speed), single
  speed (no gearbox), max wheel speed = 145 km/h. Rear wheel inertia includes the
  motor's rotor seen through the chain (`drivetrainInertia`, an estimate).
- Air drag (½ρ·CdA·v²) on the chassis and rolling resistance on wheels in contact:
  `Bike.resistance()`.
- Suspension: Planck `WheelJoint` springs (implicit = stable). `Bike.suspension()`
  converts real spring rates (N/m) and damping ratios into Planck's terms (Planck
  rates springs against the wheel's mass). Preload = the spring's rest point is set
  beyond full extension. Two `RopeJoint`s per wheel are the hard stops, plus a
  bottoming cushion (last 15% of travel, 8× stiffer). Sag: 97 mm rear / 66 mm front.
- Rider throttle + brake control (`CONFIG.throttleControl`, on by default; it stands
  in for a real rider's throttle hand since keys are on/off):
  wheelspin control (tyre ≤ 3 m/s faster than the bike), wheelie control (measured
  against the slope under the rear tyre, less wheelie allowed uphill), throttle held
  steady in the air (wheel keeps pace with the bike), and front brake eased when the
  rear wheel lifts. With it off, full throttle loops the bike in ~1 s.
- The rider is a separate body on a hip joint at the footpegs. Leaning moves the
  rider (real weight shift) — in the air that alone turns the bike only ~12°/s.
  `flipAssist` (N·m) adds turning so flips are possible; 0 = real life.
  The rider leans back automatically when braking.
- Crash = rider's head or torso touching the ground. On a crash the hip joint is
  destroyed so the rider falls off.
- A wheel counts as "on the ground" if it touched in the last 3 steps.
- Flips: while in the air, the lowest and highest angle are tracked relative to the
  nearest "upright". Each full turn past upright (with `flipLandingSlack` tolerance)
  is one flip. Negative angle = backflip. A crash within 12 steps of landing cancels it.
- Score = flip points (`flipPoints × turns²` per jump) + time bonus at the finish
  (`10000 − time in hundredths of a second`, never below 0).
- Level design at this bike's speed: it reaches ~85 km/h on short straights, so
  hill faces become launch ramps — leave run-out room and give jumps long landings.

## Week 1 status
Done: physics engine Planck.js; bike modelled on real electric MX bike specs (motor
torque/power curve, real geometry, suspension rates/sag/travel, brakes, drag);
rider throttle/brake control; level system with zones; test level ("Test Track",
neutral daytime look, real-size double jump); HUD; flip scoring; finish screen;
camera; tuning panel; swappable art; physics report; 21/21 automated tests passing.

Known things to handle in Week 2:
- Answer the open question above (themes / low gravity) before building levels.
- Bat level: gravity pointing up — check crash detection, throttle control (uses the
  slope under the rear tyre), flip counting and camera framing on the ceiling.
- Pumpkin level: trampolines can be terrain pieces inside a zone with `bounce`, or
  separate bouncy bodies — decide when building it.
- The test level is a placeholder; replace it with the 4 real levels.
- Final art (Week 3): replace the files in `art/` following `art/README.md`.
