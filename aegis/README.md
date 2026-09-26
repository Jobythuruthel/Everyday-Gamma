# FX-1190 AEGIS · Industrial Safety Kiosk

Standalone. It shares no code with any other FAIM Engage app, needs no internet and has zero npm dependencies. Theme: "Learn it, Feel it, Prove it."

## Run

Needs Node.js 22.5 or newer.

```
set ADMIN_PIN=choose-a-pin
npm start
```

| Screen | URL |
|---|---|
| Kiosk (touch wall, or arcade buttons) | http://localhost:1190 |
| Leaderboard wall | http://localhost:1190/board.html |
| Supervisor: stats, missed hazards, CSV, delete | http://localhost:1190/admin.html |

On Windows, `start-aegis.bat` starts the server and opens Chrome in kiosk mode.

## The four drills

| Drill | What the visitor does | How the server scores it |
|---|---|---|
| Hazard Hunt | Flags hazards in a plant scene drawn in code (steel mill or gas unit), within 30 s | 100 × severity per hazard found. A wrong flag costs 50, a random tap costs 10. Finding them all earns a time bonus. After the round, the scene shows each result: found (green), missed (amber), wrong (red). |
| Lockout-Tagout | Puts 6 shuffled steps in order | 100 per step in the right place, plus 200 for a perfect sequence |
| PPE Loadout | Equips a worker for 3 tasks | +100 per correct item, −50 per wrong item, +100 for each exact loadout |
| Emergency Reaction | Hits the pad or any button when the alarm fires, 3 times | Pressing too early or not at all scores 0. A round finished faster than the alarms could sound scores 0. |

If there are more than 3 random taps within 2 seconds, the screen locks for 1.5 seconds with "Slow down. Inspect first."

## Content

`content.json` holds the scenes, hazard positions and severities, the LOTO steps and the PPE tasks, all in English and Arabic. HSE teams can move a hazard by changing its `x`/`y` (percent), or turn a safe item into a hazard with `variant` and `hazard: true`. No redrawing is needed. **This is draft content: the client HSE team must approve it.**

## Tests

`npm test`: 9 tests cover content integrity, every scoring rule, that answers never reach the browser, one submission per round, reaction anti-cheat, the certificate, stats, export, deletion and HTTP security.

## Not in this version

Camera and gesture input (MediaPipe). It needs a model download and testing in the venue's lighting. Touch and arcade input cover every drill today.
