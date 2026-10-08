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
(Matter.js is stored locally in `lib/`).

Controls: Up/W gas · Down/S brake (reverse when stopped) · Left/A lean back ·
Right/D lean forward · R restart level · T tuning panel.

## How the code is organized
Plain `<script>` files (no ES modules) so the game works from `file://`.
Load order in `index.html` matters: matter → config → levels → bike → game.

| File | What it does |
|------|--------------|
| `index.html` | The page: canvas, tuning panel HTML/CSS, script tags. |
| `lib/matter.min.js` | Matter.js 0.19.0 physics engine (official npm build, same file cdnjs serves). |
| `js/config.js` | `CONFIG`: every tunable number (gravity, engine, lean, suspension, grip, camera, scoring). `CONFIG_DEFAULTS` is a copy used by the panel's Reset button. |
| `js/levels.js` | `Shapes` helpers (line, hills, curve, kicker, join) and the `LEVELS` array. |
| `js/bike.js` | `Bike`: builds the bike (chassis compound body = frame + rider torso + head sensor, plus 2 wheels on V-shaped spring pairs), controls, spring damping, bump stop, speed limit, ground contact detection, drawing. |
| `js/game.js` | `Game`: fixed-timestep loop (60 Hz), level loading, terrain bodies, physics zones, crash/checkpoint/finish, flip scoring, camera, input, drawing, HUD. Also `Tuning` (the T panel). |
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
- Coordinates are pixels, **y grows downward**.
- Each terrain piece is one continuous ground line; a gap between pieces is a hole.
  `solidAbove: true` makes the solid part sit above the line (for ceilings — Bat level).
- Physics in use = defaults → level `physics` → the zone the bike is in.
  `gravityScale` multiplies `CONFIG.gravity`; `friction` multiplies `CONFIG.wheelGrip`;
  `bounce` is set on the tyres (0 = none, 1 = very bouncy).

### Physics notes (important for future changes)
- Matter.js's built-in constraint damping ignores rotation and kills flips, so the
  springs use `damping: 0` and `Bike.dampSprings()` does rotation-aware damping instead.
- Leaning (`addSpin`) spins the whole bike around its combined centre of mass so it
  doesn't fight the springs. Spin is capped by `maxSpinSpeed` and fades with
  `airSpinDamping` when you let go.
- `Bike.limitTravel()` is a bump stop: without it, a hard landing can push the frame
  through the springs so the suspension turns inside-out.
- `Bike.limitSpeed()` caps part speed so wheels can't punch through the ground.
- A wheel counts as "on the ground" if it touched in the last 4 steps (rolling wheels
  lose contact for single steps).
- Flips: while in the air, the lowest and highest angle are tracked relative to the
  nearest "upright". Each full turn past upright (with `flipLandingSlack` tolerance)
  is one flip. Negative angle = backflip. A crash within 12 steps of landing cancels it.
- Score = flip points (`flipPoints × turns²` per jump) + time bonus at the finish
  (`10000 − time in hundredths of a second`, never below 0).

## Week 1 status
Done: bike physics, level system with zones, test level ("Test Track"), HUD,
flip scoring, finish screen, camera with look-ahead, tuning panel with Copy settings,
21/21 automated tests passing.

Known things to handle in Week 2:
- Bat level: gravity pointing up means the rider's "upright" is flipped; check crash
  detection, flip counting and camera framing when riding on the ceiling.
- Pumpkin level: trampolines can be terrain pieces inside a zone with `bounce`, or
  separate bouncy bodies — decide when building it.
- The test level is a placeholder; replace it with the 4 real levels.
