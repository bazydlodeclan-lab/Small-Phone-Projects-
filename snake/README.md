# Snake Lab

A remake of Google Snake with all its modes, board sizes, apple amounts and speeds, plus two kinds of AI:

- **Watch AI**: built-in AIs that already know how to play.
  - **Perfect** never dies. In Classic, Borderless, Peaceful, Cheese, Twin, Poison and Light (and Blender mixes of them, except Cheese + Twin) it is guaranteed to fill the board. In modes with obstacles it plays as safely as it can, but some of those modes can trap any player.
  - **Speedrunner** goes straight for apples. It is faster while the snake is short and can die.
- **Train AI**: an AI that learns from scratch with reinforcement learning (Deep Q-Learning). You set the rewards, what it can see and its controls, then watch every attempt, see a progress chart, and replay any attempt.

## How to open it

Double-click `index.html`. It runs in any browser, phone or computer, with nothing to install.

## Settings

| Setting | Options |
|---|---|
| Mode | Classic, Wall, Portal, Cheese, Borderless, Twin, Winged, Yin Yang, Key, Sokoban, Poison, Dimension, Minesweeper, Statue, Light, Shield, Arrow, Hotdog, Magnet, Gate, Peaceful. Turn on Blender to mix modes. |
| Apples | 1, 3, 5, Dice (1 to 6 new apples each time the board is cleared) |
| Speed | Slow, Normal, Fast |
| Board | Small 10×9, Standard 17×15, Large 24×21 |

Modes marked with `*` in the game follow fan descriptions of Google's rules and may differ slightly from the real game.

## Files

| File | What it does |
|---|---|
| `index.html` | The page |
| `css/style.css` | The look |
| `js/engine.js` | Game rules for every mode |
| `js/ai.js` | The Perfect and Speedrunner AIs |
| `js/rl.js` | The self-learning AI |
| `js/render.js` | Draws the board |
| `js/app.js` | Buttons, keys, tabs, training screen |
| `test/run-tests.js` | Checks the Perfect AI wins every test game: `node snake/test/run-tests.js 10` |
| `test/modes-check.js` | Plays every mode with both AIs: `node snake/test/modes-check.js 3 small` |
| `test/rl-check.js` | Trains the learning AI without a screen: `node snake/test/rl-check.js 300` |
