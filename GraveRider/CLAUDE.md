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
| `js/config.js` | `CONFIG`: every tunable number in real units (m, kg, s, N·m, Hz). `CONFIG_DEFAULTS` is a copy used by the panel's Reset button. `ART`: the picture file for each part. |
| `js/levels.js` | `Shapes` helpers (line, hills, curve, kicker, join) and the `LEVELS` array. |
| `js/bike.js` | `Bike`: builds the bike (chassis, 2 wheels on wheel joints, rider body on a hip joint), controls, throttle control, suspension tuning, crash let-go, ground contact detection, drawing with the art files. |
| `js/game.js` | `Game`: fixed-timestep loop (60 Hz), level loading, terrain (Planck chain shapes), physics zones, crash/checkpoint/finish, flip scoring, camera, input, drawing, HUD. Also `Tuning` (the T panel). |
| `art/` | `bike.svg`, `wheel.svg`, `rider.svg`, `dirt.svg` + `art/README.md` with exact sizes and guide points for replacing them. |
| `tests/run-tests.js` | Automated Playwright tests (21 checks) with screenshots in `tests/screenshots/` (git-ignored). Run: `node tests/run-tests.js` from this folder. |

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
- Real-world units and masses: bike 105 kg, rider 75 kg, wheels 9 kg, gravity 9.81.
- Wheels use Planck `WheelJoint`s (implicit spring + damper = stable). Planck rates
  the spring against the wheel's own mass, so `Bike.suspension()` converts the
  slider's Hz into the right value for the load each spring carries. Two `RopeJoint`s
  per wheel act as hard stops at full extension and full compression.
  (An earlier hand-made spring was unstable on hard hits — don't go back to it.)
- The engine is the rear WheelJoint motor. A "gearbox" limits the target wheel speed
  to bike speed + `gearSlip`, and the rear wheel has extra inertia
  (`drivetrainInertia`) like a real engine flywheel. Without these, the wheel races
  up in the air and the reaction flips the bike.
- `throttleControl()` eases off the engine in a steep wheelie (front wheel up for
  8+ steps), like a real rider; otherwise holding gas loops the bike.
- The rider is a separate body on a hip joint at the footpegs. Leaning moves the
  rider (real weight shift, speed-limited by `riderLeanSpeed`) and adds
  `leanStrength` torque to the chassis so flips are possible. There is no air spin
  damping: like real physics, the spin continues until you counter-lean.
- Crash = rider's head or torso touching the ground. On a crash the hip joint is
  destroyed so the rider falls off.
- A wheel counts as "on the ground" if it touched in the last 3 steps.
- Flips: while in the air, the lowest and highest angle are tracked relative to the
  nearest "upright". Each full turn past upright (with `flipLandingSlack` tolerance)
  is one flip. Negative angle = backflip. A crash within 12 steps of landing cancels it.
- Score = flip points (`flipPoints × turns²` per jump) + time bonus at the finish
  (`10000 − time in hundredths of a second`, never below 0).

## Week 1 status
Done: realistic bike physics (Planck.js), level system with zones, test level
("Test Track"), HUD, flip scoring, finish screen, camera with look-ahead, tuning
panel with Copy settings, swappable art files (bike, wheel, rider, dirt),
21/21 automated tests passing.

Known things to handle in Week 2:
- Bat level: gravity pointing up means the rider's "upright" is flipped; check crash
  detection, throttle control, flip counting and camera framing on the ceiling.
- Pumpkin level: trampolines can be terrain pieces inside a zone with `bounce`, or
  separate bouncy bodies — decide when building it.
- The test level is a placeholder; replace it with the 4 real levels.
- Final art (Week 3): replace the files in `art/` following `art/README.md`.
