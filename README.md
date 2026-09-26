# FAIM Engage · Event Software Suite

Six standalone kiosk apps. None shares code with another, so each one can be installed, run and updated on its own. Every app runs offline on one Windows machine with only **Node.js 22.5 or newer** installed; there are no npm installs.

| App | Folder | Port | What it does | Tests |
|---|---|---|---|---|
| FX-8802 CITADEL | `citadel/` | 8802 | Cybersecurity games: Phish or Legit, Crack the Password, Social Engineer. Live leaderboard wall, certificate. | 8 |
| FX-1190 AEGIS | `aegis/` | 1190 | Industrial safety drills: Hazard Hunt, Lockout-Tagout, PPE Loadout, Emergency Reaction. Supervisor stats. | 9 |
| F-4029 CORTEX | `cortex/` | 4029 | Approved-answers concierge: answers word for word with its source, or refuses and calls staff. 100-question eval: zero wrong answers. | 10 |
| F-8091 CONCIERGE | `concierge/` | 8091 | Reception: QR, email or mobile check-in, walk-ins, VIP host alerts, Zebra badges over the network. | 10 |
| FX-9206 MUSE | `muse/` | 9206 | Photobooth: offline style engine or optional image API, face consent, lead-gated QR download, operator approval. | 9 |
| FX-7248 LUMEN | `lumen/` | 7248 | Hologram welcome: presence zones from camera, sensor or keys; named greeting; follow-up questions via CORTEX. | 8 |

## Install on Windows

1. Install Node.js 22 LTS and check with `node -v` (22.5 or newer).
2. Unzip an app from `dist/`, for example `citadel-v0.1.0.zip`.
3. Double-click `start-<app>.bat`. It asks for an admin PIN, starts the server and opens Chrome in kiosk mode.

Each app's own README covers screens, settings and what to check before a live event.

## Build and verify

```
./pack.sh <app>     # runs the tests, zips the app, then runs the tests again from a clean unzip
```

`dist/` holds the tested zips with SHA-256 checksums.

## Shared house rules (implemented separately in each app)

- English and Arabic with right-to-left layout; FAIM dark theme; no dependency on the internet.
- The server calculates every score. The browser never receives answers before the visitor answers.
- SQLite in WAL mode, written before anything else, so no visitor data is lost if the network drops.
- Admin pages are PIN-locked (timing-safe comparison). CSV exports are protected against spreadsheet formula injection. Every app has path-traversal protection.

## Open items before any live event

- Lawyer review of consent wording (deferred on request).
- Client approval of all content files. The question banks, safety scenes, knowledge base, styles and guest lists are drafts or demo data.
- On-site hardware tests: touch screen, arcade buttons, Zebra printer, camera, hologram brightness, and an 8-hour soak.
