# F-4029 CORTEX · Approved-Answers AI Concierge

Standalone, offline, zero npm dependencies. It is the "expert who never guesses".

## How it avoids invented answers

CORTEX never writes an answer. It matches the visitor's question against the approved knowledge base, using BM25 retrieval with Arabic normalization (runs in plain JavaScript on the kiosk). Then it does one of three things:

| Outcome | When | What the visitor sees |
|---|---|---|
| Answer | The question matches one entry clearly | The approved answer, word for word, plus its source ("Source: Agenda v3") |
| Did you mean? | Two entries explain the question equally well | Both as buttons |
| Refuse | More than a third of the question's words are unknown to the knowledge base, or the match is weak | "I don't have verified information on that", plus a "Talk to a person" button |

Every refusal is logged to the staff console as a gap. Staff can add an approved answer there, and CORTEX uses it immediately.

## Run

```
set ADMIN_PIN=choose-a-pin
npm start
```

| Screen | URL |
|---|---|
| Kiosk | http://localhost:4029 |
| Staff console: help requests (with a chime), unanswered questions, add answers, stats | http://localhost:4029/admin.html |

On Windows, `start-cortex.bat` opens both in kiosk mode.

## Voice

- **Speaking answers** uses the voices installed in Windows, which work offline. For Arabic speech, install the Arabic language pack with speech in Windows Settings > Time & language.
- **Listening** uses the browser's speech recognition. In Chrome and Edge this sends audio to the browser vendor's cloud service, so **voice input needs internet**. Typing always works offline. For fully offline voice input, a local speech model (Whisper) would be a later add-on.

## Knowledge base

`knowledge.json` holds a **demo event** (FAIM Demo Summit 2026) with 18 topics in English and Arabic. For a real event, replace every entry with the client's approved facts. Each entry has:
- question variants (`q`)
- `keywords`: dialect words and synonyms, for example وين or جوال
- the approved answer (`a`)
- a `source`

## Tests

`npm test` runs 10 tests, including the acceptance test from the production plan. That test uses 100 questions: 70 real ones worded differently from the knowledge base, and 30 trick questions (off-topic, attempts to inject instructions, or looking for facts that aren't there).

Result: **zero wrong or invented answers, and 96% of real questions answered.** The remaining 4% get "did you mean" or a refusal, never a wrong answer.

The keywords were tuned against this test set, so it is not blind. **Write a fresh 100-question set from the client's real knowledge base before go-live**, and add it to `test/eval.json`.
