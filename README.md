# Meera Content Bot

Meera sends a note (text or voice) to a Telegram bot. It's scored for
publishability, an optional current-news hook is fetched, and a LinkedIn
draft is written in her voice and sent right back to the same chat. She
reviews, edits, and publishes it herself — the bot never touches LinkedIn.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full architecture this
implements.

## Stack

- **Hosting:** Vercel (serverless Node.js functions)
- **Bot interface:** Telegram Bot API, via webhook (`/api/telegram`)
- **AI:** Google Gemini (`@google/genai`) — transcription, triage scoring,
  and drafting
- **News context:** Google News' public RSS search feed (no API key)
- **Language:** TypeScript

There is no database. Each Telegram message is handled in a single request;
nothing is persisted between messages.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get your keys

- **Telegram bot token** — talk to [@BotFather](https://t.me/BotFather),
  `/newbot`, copy the token.
- **Your Telegram user ID** — message [@userinfobot](https://t.me/userinfobot)
  and copy the numeric ID it gives you. This is the *only* ID the bot will
  respond to.
- **Gemini API key** — from [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Add the voice skill

Put your voice instructions in [`meera_voice.txt`](meera_voice.txt) at the
project root (a file already exists there — replace its contents with
whatever version you want the bot to use). This file is passed to Gemini as
the system instruction for drafting; nothing else in the code overrides it.

### 4. Configure environment variables

Copy `.env.example` to `.env` for local dev, and set the same variables in
your Vercel project (**Settings → Environment Variables**) for production:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | from BotFather |
| `TELEGRAM_USER_ID` | yes | numeric; the only user the bot accepts messages from |
| `TELEGRAM_WEBHOOK_SECRET` | no | random string; if set, the bot rejects webhook calls without a matching header |
| `GEMINI_API_KEY` | yes | from AI Studio |
| `GEMINI_FLASH_MODEL` | no | default `gemini-3.5-flash` (transcription + triage) |
| `GEMINI_PRO_MODEL` | no | default `gemini-2.5-pro` (drafting) |
| `TRIAGE_THRESHOLD` | no | default `6`; notes scoring below this are rejected before drafting |

### 5. Deploy

```bash
npx vercel deploy --prod
```

Note the deployment URL it prints (e.g. `https://meera-content-bot.vercel.app`).

### 6. Point Telegram at your deployment

```bash
TELEGRAM_BOT_TOKEN=<your token> \
DEPLOYMENT_URL=https://your-app.vercel.app \
TELEGRAM_WEBHOOK_SECRET=<same value as in your env vars, if you set one> \
npx tsx scripts/set-webhook.ts
```

This calls Telegram's `setWebhook` API with your deployment's `/api/telegram`
URL. Re-run it any time your deployment URL changes.

### 7. Verify

```bash
curl https://your-app.vercel.app/api/health
```

Should return `{"ok":true}`. If it doesn't, it tells you which environment
variable is missing (nothing sensitive is ever included).

Then message your bot from the Telegram account matching `TELEGRAM_USER_ID`.

## Local development

```bash
npx vercel dev
```

Vercel's local dev server won't be reachable by Telegram's webhook (it's not
publicly addressable) — use a tunnel (e.g. `ngrok http 3000`) and point
`scripts/set-webhook.ts` at the tunnel URL temporarily if you want to test
end-to-end locally, or just test against a real deployment.

## How a message is handled

1. **Authenticate** — the sender's numeric Telegram ID is compared to
   `TELEGRAM_USER_ID`. Anyone else gets a generic "Unauthorized user." and
   nothing is processed or stored.
2. **Ack** — the bot replies "Captured." immediately.
3. **Transcribe** (voice only) — the audio file is sent to Gemini directly;
   no separate speech-to-text service. Text messages skip this step. If
   transcription fails, Meera is told and the pipeline stops there.
4. **Triage** — Gemini scores the note 0–10 for publishability. Below
   `TRIAGE_THRESHOLD`, the bot replies with the score and rationale, and
   stops. No draft is written for a rejected note.
5. **News hook (optional)** — the bot searches Google News' RSS feed using a
   query Gemini suggested during triage. If nothing comes back, drafting
   continues without it — a missing news hook never blocks a note.
6. **Draft** — Gemini writes the LinkedIn post using the voice skill in
   `meera_voice.txt` as its only style authority, and the note (+ news hook,
   if any) as its only factual evidence.
7. **Send it back** — "Draft ready." followed by the full draft, in the same
   Telegram chat. Nothing is auto-published anywhere.

## Known limitations

- **No persistence.** Nothing is saved between messages — no note history,
  no draft versions, no way to revisit or edit a past draft through the bot.
  Each message is one self-contained run.
- **No approve/edit/reject buttons.** Review happens by Meera editing the
  text herself and posting it to LinkedIn on her own; the bot doesn't track
  what she decided.
- **No retry/idempotency protection** against Telegram redelivering the same
  update — without a database there's nowhere to record "already handled."
  In practice Telegram rarely redelivers once you return `200 OK` promptly,
  which this bot does.
- **Vercel function timeout.** Transcription + triage + drafting is 2-3
  sequential Gemini calls; `vercel.json` sets `maxDuration: 60` for the
  webhook function, which requires it to actually be honoured by your Vercel
  plan. If you see timeouts, check your plan's function duration limit.
- A more elaborate version of this idea — with a database, multi-round
  clarifying questions, and an approve/edit/reject flow — is specified in
  [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md), but isn't implemented here.
