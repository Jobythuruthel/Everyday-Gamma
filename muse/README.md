# FX-9206 MUSE · AI Photobooth

Standalone, with zero npm dependencies (vendored `qrcode-generator`, MIT). Its line: "That's me, as a hero."

## Two style engines

| Engine | When | Privacy | Speed (measured) |
|---|---|---|---|
| **Offline (default)** | No API key | The camera image never leaves the kiosk. Styles are drawn in the browser: tone map, grain, scanlines or stars, vignette, and a brand frame with RTL text. | 2.9 s from pressing the button (3-2-1 countdown included) to the finished portrait [Certain] |
| **Generative (optional)** | Set `IMAGE_API_KEY` | The capture goes to the image API (an OpenAI-compatible `/v1/images/edits` endpoint). The consent text changes to say so. | Depends on the provider: [Guessing] 10 to 30 s |

If the API fails or times out (60 s), MUSE falls back to the offline style, so the visitor always leaves with a portrait. Configure it with `IMAGE_API_KEY`, and optionally `IMAGE_API_URL` and `IMAGE_API_MODEL` (default `gpt-image-1`). Style prompts stay on the server.

## Run

```
set ADMIN_PIN=choose-a-pin
npm start
```

| Screen | URL |
|---|---|
| Kiosk | http://localhost:9206 |
| Operator: approval queue, stats, leads CSV, purge | http://localhost:9206/admin.html |
| Visitor download (via QR) | http://<kiosk LAN IP>:9206/p/<token> |

Phones download over the booth Wi-Fi, so the kiosk and visitors must be on the same network. Set `PUBLIC_URL` if the auto-detected LAN address is wrong, for example when the machine has several network adapters.

## Flow

Attract (approved gallery) → pick 1 of 4 worlds → explicit face-processing consent (server-enforced) → camera with a face oval and a 3-2-1 countdown → portrait → retake or "Get my photo" → email or mobile (+ optional marketing) → QR to the download page.

## Data rules

- Only the finished portrait is saved; the raw camera frame is never written to disk.
- Photos are deleted after `RETENTION_DAYS` (default 30), checked every hour. Leads stay for export.
- The download link is released only after the visitor leaves an email or mobile.
- Nothing appears on the public attract screen until an operator approves it.

## Styles

`styles.json` holds 4 demo worlds (Cyber Guardian, Industrial Innovator, Space Explorer, Vision Leader). Each has EN/AR titles, a colour look, an accent colour and a generative prompt. Edit the colours, event name and hashtag per client. No code changes are needed.

## Tests

`npm test` runs 9 tests. They cover:
- style integrity
- JPEG validation
- the consent gate
- the lead-gated link
- approval before public display
- retention deleting files
- stats and CSV injection safety
- the image API client (multipart request and error path)
- API fallback
- the full HTTP flow

The browser test used Chromium's fake camera in English and Arabic.

## Before live use

- Test with the real camera and ring light. The fake camera proves the pipeline, not the look on real faces.
- If you enable the generative engine, time 50 sessions on the venue network against the plan's target of under 20 s.
- Operators approve or hide portraits for the public screen. The generative provider's own safety filter is the first line; operator approval is the second.
