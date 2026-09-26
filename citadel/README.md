# FX-8802 CITADEL · Cybersecurity Games Kiosk

Standalone. It shares no code with any other FAIM Engage app, needs no internet and has zero npm dependencies.

## Run

Needs Node.js 22.5 or newer (`node -v`).

```
set ADMIN_PIN=choose-a-pin        (Windows)   |   export ADMIN_PIN=choose-a-pin   (Mac/Linux)
npm start
```

| Screen | URL |
|---|---|
| Kiosk (touch or arcade) | http://localhost:8802 |
| Leaderboard wall (second screen) | http://localhost:8802/board.html |
| Operator: stats, lead CSV, delete | http://localhost:8802/admin.html |

On Windows, `start-citadel.bat` starts the server and opens Chrome in kiosk mode. Other devices on the booth network can open the wall at `http://<kiosk-ip>:8802/board.html`.

## Visitor flow

Attract → name + mobile + consent (2 fields) → pick one of 3 missions → 5 timed questions with instant feedback → score and rank → play another or finish → optional email, company and title to unlock the certificate → reset.

Idle for 45 seconds on any screen: resets to attract. Arcade encoders just need to send keys `1` `2` `3` and `Enter`, so no drivers or WebHID are needed.

## Rules the server enforces

- Scores are calculated on the server only: `100 × difficulty × max(0.1, 1 − time/limit)`. Answers never reach the browser before the visitor answers.
- The daily board sums each visitor's best score per mission, so replays can improve a score but never stack.
- Each visitor gets 3 plays per mission per day.
- Game consent is required and must be ticked explicitly. Marketing consent is optional and unticked. Both are stored with time, language and screen.
- The leaderboard shows first name and initial only.
- The CSV export is protected against spreadsheet formula injection, and the delete endpoint removes every record for a visitor.

## Content

`questions.json` holds 3 missions × 6 questions in English and Arabic. **It is a draft: the client security team must approve it before the event.** Edit the file and restart the server to change content. The admin page lists the most-missed questions so you can report gaps to the client.

## Tests

```
npm test
```

8 tests cover scoring, the bank's integrity, consent, a full round, timeouts, replay limits, export, deletion, admin lock and path traversal.

## Before any live event

- [ ] Lawyer approves the consent wording (replace `[Event organiser]` in `public/app.js`)
- [ ] Client approves `questions.json`
- [ ] 8-hour soak on the event machine
- [ ] Full offline day with the network cable pulled
- [ ] Arcade buttons mapped to keys 1–3
