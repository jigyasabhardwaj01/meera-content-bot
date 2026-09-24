# Roadmap — Case 1 · Meera / Content Engine

This is the architecture this project implements, taken from the component
map ("Case 1 · Meera / Content Engine — Components Map · Answer Key"):

| Actor | Role |
|---|---|
| Meera (Founder) | Drops a voice note (or text) into Telegram |
| Telegram | Receives the note, transcribes to text |
| Gemini API (Triage) | Scores the note 0–10 for publishability; rejects low-score notes |
| Google News (Context) | Fetches a relevant industry news hook |
| Gemini API (Draft) | Drafts a post in Meera's voice (skill) + the news hook |
| Review Gate (Meera) | Reviews the draft, edits if needed, publishes to LinkedIn herself |

Flow: `Telegram → transcribe → Gemini triage → (if it passes) Google News hook
→ Gemini draft → back to Telegram for Meera to review`.

## Mapped to this repo

- **Telegram in/out** — [`lib/telegram.ts`](../lib/telegram.ts): downloads voice
  files, sends messages back.
- **Transcription** — [`lib/gemini.ts`](../lib/gemini.ts) `transcribeAudio()`.
  Telegram itself doesn't transcribe; Gemini accepts the voice note's audio
  directly, so there's no separate transcription API.
- **Triage** — [`lib/gemini.ts`](../lib/gemini.ts) `triageNote()`: returns a
  0–10 score, a topic, a suggested news-search query, and a rationale, as
  structured JSON. Below `TRIAGE_THRESHOLD` (default 6), the pipeline stops
  and Meera gets the score + rationale instead of a draft.
- **Context** — [`lib/news.ts`](../lib/news.ts) `fetchNewsHook()`: Google
  News' public RSS search feed, no API key needed. Optional — if nothing
  relevant turns up or the fetch fails, drafting proceeds without it.
- **Draft** — [`lib/gemini.ts`](../lib/gemini.ts) `draftPost()`: the voice
  skill ([`meera_voice.txt`](../meera_voice.txt)) is passed as the system
  instruction; the note and any news hook are the only evidence the model is
  given.
- **Review gate** — the bot sends the draft back to the same Telegram chat.
  Meera reviews, edits, and publishes to LinkedIn herself; **the bot never
  calls a LinkedIn API and never publishes anything.**

## What this build deliberately leaves out

An earlier, more elaborate spec for this same idea (kept at
[`docs/BUILD_SPEC.md`](./BUILD_SPEC.md) for reference) called for a SQLite
database, a note/idea/draft state machine, multi-round clarifying questions,
separate factual/voice QA passes, and inline Approve/Edit/Reject buttons.
None of that is implemented here — this build follows the simpler component
map above instead: single-request-response webhook, no persistence, no
buttons, no clarification loop. If you want any of that layered back in
later, `docs/BUILD_SPEC.md` is the spec for it; it would need a real database
(Vercel functions don't keep local state between requests), so this couldn't
stay on SQLite.
