# Grave Rider art — how to replace a picture

Every picture in the game is one file in this folder. To change one:

1. Make or find your new picture (PNG with a transparent background, or SVG).
2. Make it the **same shape (width ÷ height)** as the size listed below, and
   line it up with the guide points listed for it.
3. Either save it with the same file name (for example `bike.svg`), **or** save it
   with a new name (for example `bike.png`) and change the matching line in
   `js/config.js` under `var ART = {`.
4. Open `index.html` again to see it.

The game resizes each picture to the real-world size below, so bigger pictures
just look sharper. All sizes are side views with the bike **facing right**.

| File | Real size | Picture shape | What it is | Guide points (in the picture, from the top-left corner) |
|------|-----------|---------------|------------|--------------------------------------------------------|
| `bike.svg` | 2.20 m × 1.10 m | 2 : 1 (e.g. 660 × 330 px) | Frame, engine, seat, tank, plastics. **No wheels, no fork legs, no swingarm** (the game draws those because they move). | Bike centre at 50% across, 68% down. Rear axle at 17% / 86%. Front axle at 85% / 86%. Handlebar grip at 71% / 12%. Footpeg at 48% / 79%. |
| `wheel.svg` | 0.68 m × 0.68 m | 1 : 1 (e.g. 300 × 300 px) | One whole wheel with tyre. It spins. | Axle exactly in the middle. Tyre touching the edges. |
| `rider.svg` | 0.75 m × 1.47 m | about 1 : 2 (e.g. 225 × 441 px) | Rider **without arms** (the game draws the arms reaching to the handlebar). | Boot on the footpeg at 60% across / 97% down. Shoulder at 60% / 27%. Head centre at 71% / 12%. |
| `dirt.svg` | repeats | square (e.g. 128 × 128 px) | Ground texture. | Left/right and top/bottom edges must match so it tiles without seams. |

## Tips

- AI image tools usually can't hit exact guide points. Generate the picture,
  then line it up in a free editor such as Photopea (photopea.com), using the
  table above.
- Keep the background transparent, or a box will show around the picture.
- If a new picture looks shifted, the guide points are off. Move the drawing
  inside the picture rather than changing code.
