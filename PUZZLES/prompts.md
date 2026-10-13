# Reroute the Reactor - Specification & Prompts

## Overview
A cooperative escape room / scavenger hunt puzzle game built with Node.js, Express, and vanilla HTML/CSS/JavaScript. Teams configure analog-style reactor controls (3 levers, 4 patched cables) across 3 rounds to stabilize the reactor core and reveal glyphs on a 5x7 glowing LED heat map matrix.

---

## Before you start
Create an empty folder (for example reroute-reactor) and open it as the workspace in Antigravity. This also solves the “no project folder” problem for this puzzle.
I’d keep it simple: Node.js with Express, plain HTML, CSS and JavaScript. It runs on one laptop and works over your local network, which suits the event. You can copy it into the main site later.
Let the agent make a plan first and read it before it writes code. Reject anything that adds extra features.

---

## Prompt 1: project setup
Create a new Node.js project using Express in this folder. Structure:
- `server/index.js` (Express server, serves `/public`, listens on `0.0.0.0`, port 3000, so other laptops on the same network can open it)
- `server/config.private.js` (puzzle answers; never sent to the browser; add it to `.gitignore`)
- `public/index.html`, `public/style.css`, `public/app.js`
Add an npm script "start". Add a README with exact steps: install, run, find my laptop's local IP address on Windows, and open the game from a second laptop. Do not build the puzzle yet. Show me the plan before writing code.

---

## Prompt 2: the server brain (keeps the answers off the browser)
In `server/`, build the puzzle logic for a game called "Reroute the Reactor". Rules:
- A team has a team code (for example K2, M5) and plays 3 rounds.
- `config.private.js` holds, per team code and per round: the correct lever settings (3 levers, each 0 to 3), the correct wire mapping (4 wires each connected to 1 of 4 sockets), and the target letter. Fill in placeholder data for teams K2 and M5; the three rounds spell O, F, F for K2 and a different 3-letter word for M5. Use obvious placeholders I can change.
- Add `POST /api/state` with `{teamCode, round, levers:[a,b,c], wires:[s1,s2,s3,s4]}`. It returns ONLY a 7-row by 5-column grid of brightness values 0 to 9 to draw. If the setup is fully correct, the grid is a clean pixel-font version of the target letter. If not, return a plausible WRONG glyph or noise that is deterministic for that exact setup (the same wrong setup always gives the same wrong picture), blended so it is not obviously fake.
- Do NOT ever return the target letter, the correct settings, or whether the setup is correct, in any response. Only the grid.
- Add `POST /api/submit` with `{teamCode, round, letter}`. Return `{ok:true/false}`. Limit to 5 attempts per minute per team, and log each attempt (time, team, round, result) to a file.
- Validate all inputs and reject anything unexpected.
Include a short test script that checks: correct setup returns the clean letter grid, wrong setup returns a different grid, and the responses never contain the answer text.

---

## Prompt 3: the heat map screen
In `public/`, build the heat map. A 5-column by 7-row grid of glowing cells in a dark sci-fi style (dark navy background, amber and cyan glow). Each cell's brightness comes from a value 0 to 9. Add a 1-second settling animation when the grid changes (cells flicker toward their new value). Use only CSS and JavaScript, no external libraries or internet files. Make a function `renderGrid(grid)` I can call from other code. For now, add a button that renders a sample letter so I can see it.

---

## Prompt 4: the levers
Add 3 vertical levers to `public/app.js` and `index.html`. Each lever has 4 snap positions (0 to 3) with labelled notches. The child drags the handle up or down and it snaps to the nearest notch. It must work with a mouse and with touch. Each lever has a label (Lever A, B, C). When any lever changes, call a function `onChange()` that I can hook up later. Style to match the heat map. No external libraries.

---

## Prompt 5: the wires
Add 4 wires on the left and 4 sockets on the right. Each wire has a distinct colour AND a distinct shape icon on its plug (circle, triangle, square, diamond). Each socket shows one of those same shape icons beside it, but the sockets are in a shuffled order. The child drags a plug onto a socket and it snaps and draws a curved cable. Dragging a plug to another socket moves it. Two wires cannot share a socket (the older one pops back). Works with mouse and touch. Expose the current wiring as an array `wires[i] = socket index for wire i`, and call `onChange()` whenever it changes. No external libraries.

---

## Prompt 6: connect everything and add rounds and hints
Connect the heat map, levers and wires to the server:
- On any change, wait 150 ms, then `POST /api/state` with the team code, round, levers and wires, and call `renderGrid` with the returned grid.
- Add a team-code box at the start. Store the team code only in memory (not localStorage).
- Add a round indicator (Round 1 of 3), a "Which letter do you see?" box with a Submit button that calls `/api/submit`, and a message area. On a correct letter, advance to the next round and reset levers and wires. After round 3, show the 3 letters joined together as "Suffix recovered".
- Add 3 hint levels. Level 1: flash the columns of the heat map that differ from the target. Level 2: light up one socket's icon. Level 3: lock one lever into the correct position. To do this the server must provide hints: add `GET /api/hint?teamCode=&round=&level=` which returns only what that level needs (for example "lock lever B at position 2"), not the full answer. Show hints only after the team clicks a Hint button, and add a 2-minute penalty note for level 3.
Do not put any answers in the browser code.

---

## Prompt 7: break-test it as if you were a student
Review this whole project as a security tester for a school game. Check:
1) does any file in `/public` or any API response contain a target letter, correct lever settings, or the wiring answer?
2) can a user call `/api/hint` for level 3 without earning it?
3) can wrong inputs crash the server?
4) can the attempt limit be bypassed by changing the team code format or sending many requests in parallel?
5) is `config.private.js` excluded from `/public` and git?
Report each finding with the file and line, then fix the real problems with minimal changes. Then use the browser to run through round 1 with correct and wrong settings and confirm the screen behaves as described.
