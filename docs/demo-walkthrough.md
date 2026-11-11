# Two-minute demo walkthrough

The optional frontend deliverable is already included. Use the running interface for the presentation; a video is not required to operate the submission.

## Before presenting

1. Run `npm run demo` from the repository root, or double-click `Start Katchup.command` on macOS.
2. Open `http://localhost:5173/?start=17` in a current browser.
3. Keep a terminal in the repository ready with `npm run examples`.

No provider or backend configuration is needed for this demonstration.

## Live sequence

| Time | Action | What the audience sees |
| --- | --- | --- |
| 0:00 to 0:20 | On slide 17, point to the glossary and symbol guide | Mathematical notation and the meaning of each letter beside the original slide |
| 0:20 to 0:45 | Jump to slide 25 and click Katchup | Context that links the Bellman equation to earlier ideas; text appears progressively |
| 0:45 to 1:05 | Click Explain this slide | A separate explanation panel replaces Katchup on the left; the glossary stays open |
| 1:05 to 1:25 | Jump to slide 46 | The worked calculation explains why the displayed reward gives 9.4 rather than 8.4 |
| 1:25 to 1:40 | Open the original PDF, or jump to slide 58 | Source access or a plain-language interpretation of a belief state |
| 1:40 to 2:00 | Run `npm run examples` in the terminal | Seven checks pass, including a future-transcript refusal and rejection of an invalid citation |

For a frontend-only presentation, use the first five steps. For the agent evaluation, include the terminal step so the boundary is observable rather than only described.

## Useful presentation details

- Keyboard shortcuts: K for Katchup, E for explanation, G for glossary, arrow keys for slides, Esc to close the focused panel.
- Closing and reopening a tab restarts the text reveal. Changing slides cancels unfinished output.
- The symbol guide remains immediately available; reduced-motion settings show text without the animation.
- The three-beat introduction is available at `http://localhost:5173/#present` or by pressing P.
- All UI content is in English. The lecture is about Markov Decision Processes and reinforcement learning.

The technical submission describes the deterministic Lecture 5a path and the optional model-backed agent separately. This walkthrough demonstrates the shipped local interface and the executable boundary checks.
