// Telegram webhook — the single entry point for the whole pipeline.
//
// Roadmap (see docs/ROADMAP.md for the source diagram):
//   Meera → Telegram (voice or text) → transcribe (if voice)
//         → Gemini triage (score 0-10, reject if below threshold)
//         → Google News (optional industry hook)
//         → Gemini draft (Meera's voice skill + note + hook)
//         → sent back to Meera in the same chat for her to review/edit/publish herself
//
// The bot never posts to LinkedIn. That step is manual, by Meera, outside this app.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { loadConfig, ConfigError, type Config } from "../lib/config.js";
import { TelegramClient, type TelegramUpdate, type TelegramMessage } from "../lib/telegram.js";
import { GeminiClient } from "../lib/gemini.js";
import { fetchNewsHook } from "../lib/news.js";
import { loadVoiceSkill } from "../lib/voice.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    // Missing env vars is a deployment problem, not a Telegram problem — log it,
    // tell Telegram nothing useful, and don't leak details anywhere.
    console.error("Startup config error:", err instanceof ConfigError ? err.message : err);
    res.status(500).send("Server misconfigured");
    return;
  }

  if (config.telegramWebhookSecret) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (header !== config.telegramWebhookSecret) {
      res.status(401).send("Unauthorized");
      return;
    }
  }

  const update = req.body as TelegramUpdate;
  const message = update?.message;

  // Always 200 quickly so Telegram doesn't retry-storm us, even for updates we ignore.
  if (!message) {
    res.status(200).send("ok");
    return;
  }

  const senderId = message.from?.id;
  if (senderId !== config.telegramUserId) {
    // Do not process, do not store, do not reveal anything about the app.
    console.warn("Rejected message from unauthorized Telegram user id", senderId);
    const telegram = new TelegramClient(config.telegramBotToken);
    await telegram.sendMessage(message.chat.id, "Unauthorized user.").catch(() => {});
    res.status(200).send("ok");
    return;
  }

  const telegram = new TelegramClient(config.telegramBotToken);

  if (!message.text && !message.voice && !message.audio) {
    await telegram.sendMessage(message.chat.id, "That input type isn't supported yet.");
    res.status(200).send("ok");
    return;
  }

  // Ack immediately, then do the real work in the background after responding
  // to Telegram (Vercel's waitUntil keeps the function alive for this).
  await telegram.sendMessage(message.chat.id, "Captured.");

  waitUntil(processNote(config, telegram, message).catch((err) => {
    console.error("Unhandled error processing note:", err);
  }));

  res.status(200).send("ok");
}

async function processNote(config: Config, telegram: TelegramClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const gemini = new GeminiClient(config.geminiApiKey, config.geminiFlashModel, config.geminiProModel);

  // 1. Get the note as text — transcribe if it's a voice message.
  let noteText: string;
  if (message.voice || message.audio) {
    const fileId = (message.voice ?? message.audio)!.file_id;
    try {
      const { bytes, mimeType } = await telegram.downloadFile(fileId);
      noteText = await gemini.transcribeAudio(bytes, mimeType);
    } catch (err) {
      console.error("Transcription failed:", err);
      await telegram.sendMessage(
        chatId,
        "I captured the voice note, but couldn't transcribe it. Please try sending it again."
      );
      return;
    }
  } else {
    noteText = message.text!;
  }

  // 2. Scoring guardrail (checkpoint B1.1): strict 0-10 score before any drafting
  // happens. A thrown error here (malformed/out-of-contract Gemini output) must
  // never fall through to drafting — it fails closed, same as any other error.
  let triage;
  try {
    triage = await gemini.triageNote(noteText);
  } catch (err) {
    console.error("Scoring failed:", err);
    await telegram.sendMessage(chatId, "I captured the note, but couldn't analyse it right now.");
    return;
  }

  if (triage.score < config.triageThreshold) {
    await telegram.sendMessage(
      chatId,
      `I didn't create a draft because this note isn't substantive enough yet: ${triage.reason}`
    );
    return;
  }

  await telegram.sendMessage(chatId, `Scored ${triage.score}/10 — worth developing. Drafting now.`);

  // 3. Optional current-context hook. Never blocks or fails the note if it errors.
  const news = await fetchNewsHook(triage.searchQuery || triage.topic || noteText.slice(0, 80));

  // 4. Draft in Meera's voice, using only the note + any verified news hook.
  let voiceSkill: string;
  try {
    voiceSkill = loadVoiceSkill();
  } catch (err) {
    console.error("Voice skill missing:", err);
    await telegram.sendMessage(chatId, "I found the idea, but couldn't create the draft. The note is saved.");
    return;
  }

  let draft: string;
  try {
    draft = await gemini.draftPost(voiceSkill, noteText, news);
  } catch (err) {
    console.error("Draft generation failed:", err);
    await telegram.sendMessage(chatId, "I found the idea, but couldn't create the draft. The note is saved.");
    return;
  }

  await telegram.sendMessage(chatId, "Draft ready.");
  await telegram.sendMessage(chatId, draft);
}
