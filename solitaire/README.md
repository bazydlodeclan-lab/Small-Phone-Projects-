# Solitaire Lab

A remake of Google Solitaire (Klondike) with two built-in AIs and an AI you can train from scratch.

- **Play**: Easy (draw 1) or Hard (draw 3). Choose a random deal, or a winnable deal the solver has proven can be won. Tap or drag cards, Undo, score and timer.
- **Watch AI**
  - **Solver** peeks at face-down cards. It wins every deal it can prove is winnable, and tells you when a deal is proven unwinnable.
  - **Fair player** only sees what you see. It imagines the hidden cards several ways, solves each, and plays the move that wins most often.
- **Train AI**: reinforcement learning (Deep Q-Learning). Set the rewards, what it sees and its brain size. You get a progress chart, a breakdown by mode (Easy vs Hard), every attempt with replays, and save/load.

## How to open it

Double-click `index.html`. It runs in any browser, phone or computer, with nothing to install.

## Tests

| Command | What it checks |
|---|---|
| `node solitaire/test/solver-check.js 50 1` | Solves 50 Easy deals and replays every solution to make sure it is legal |
| `node solitaire/test/fair-check.js 10 1` | Plays 10 deals with the fair player |
| `node solitaire/test/rl-check.js 300 1` | Trains the learning AI for 300 attempts and checks replays |

## Notes

- Scoring follows Windows "Standard" Solitaire scoring. Google does not publish its exact numbers.
- The stock can be gone through as many times as you like.
