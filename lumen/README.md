# FX-7248 LUMEN · Proximity Hologram Welcome

Standalone, offline, zero npm dependencies. Its line: "It turned and said hello to me."

A particle guide is drawn in code on pure black, for hologram fans (Hypervsn), holobox units or transparent OLED. It reacts to three distance zones, greets by name in English or Arabic, and answers follow-up questions through CORTEX when you link it.

## Run

```
set ADMIN_PIN=choose-a-pin
set CORTEX_URL=http://192.168.1.20:4029     (optional)
npm start
```

| Screen | URL |
|---|---|
| Hologram output | http://localhost:7248 (add `?nocamera` when a sensor is the only input) |
| Operator: live stats, zone test buttons, guest list import | http://localhost:7248/admin.html |
| Sensor input | `POST http://<ip>:7248/api/presence` with `{"distance": 1.4}` (metres) or `{"zone": "interaction"}` |

## Presence: three interchangeable inputs

| Input | How | Best for |
|---|---|---|
| **Camera (built in)** | Motion differencing on a 160 × 90 frame at 10 fps. The height of the moving area stands in for distance. No model download, nothing stored. | Quick setups. [Likely] Weaker in crowds and changing light. |
| **Any distance sensor** | An ESP32 with a time-of-flight or LiDAR sensor, or a pressure mat, posts to `/api/presence`. It overrides the camera for 10 s after each reading. | Busy halls: this is the reliable option |
| **Keys** | `0` empty, `1` passing, `2` attention, `3` interaction. A USB trigger can send these. | Testing and simple triggers |

Zones follow the production plan: passing more than 3 m away, attention at 2 to 3 m, interaction under 2 m. A zone must hold for 4 readings before it changes. A person standing still keeps their zone for about 4.5 s, because stillness makes no motion.

## Behaviour

- **Passing.** The figure glows dimly and floats.
- **Attention.** The figure brightens and turns toward the visitor, and "Come closer" appears.
- **Interaction.** The figure speaks a greeting based on the time of day. Touch buttons appear: 3 quick questions (answered by CORTEX) and "Call a person".
- **Badge scan** (USB scanner, keyboard mode). If the code is on the guest list, the figure greets the guest by first name in their language. First name only is friendlier, and less personal data is spoken in a public space.
- **"Call a person".** With CORTEX linked, this creates a handoff on the CORTEX staff console, with a chime. Without CORTEX, or if it is unreachable, the figure asks the visitor to go to the desk. It never claims someone is coming when no one was told.
- **Visit logging.** Each visit is logged when the visitor leaves: furthest zone reached, greeted, named, questions asked and dwell time. The operator page shows passers-by, approach rate, greetings, named greetings and average dwell.

Voice uses the Windows speech voices, offline. For Arabic speech, install the Arabic language pack with speech. The mouth area of the figure pulses while it speaks.

## Tests

`npm test` runs 8 tests. They cover:
- motion detection on synthetic frames (empty, far, near, position, lighting changes ignored)
- the smoothing tracker
- greeting text in both languages
- the guest list
- analytics and caps
- **sensor → server → page delivery over SSE**
- the operator lock
- the CORTEX link, including CORTEX being down

The browser run used the **real CORTEX server**: a named Arabic greeting, then an Arabic answer from CORTEX, then a handoff showing on the CORTEX staff console.

## Before live use

- Test the camera path in the venue light and crowd. If it triggers falsely, use a distance sensor.
- Check brightness on the actual hologram hardware. Particle size and brightness are in `public/figure.js`.
- Not included: lip-synced video of a real person. The figure is code-drawn by design, so it can be re-branded without a video shoot.
