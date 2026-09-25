// TEMPORARY diagnostic endpoint — remove after debugging.
// Runs the exact same Gemini calls the bot uses (triage + draft) against a
// fixed test note, and returns the real success/failure detail instead of
// swallowing it the way the Telegram-facing pipeline does on purpose.
// No Telegram involved, no arbitrary input accepted — just a fixed self-test.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadConfig, ConfigError } from "../lib/config.js";
import { GeminiClient } from "../lib/gemini.js";

const TEST_NOTE =
  "Just realised our new moisturiser's pH testing takes 3 separate readings over 48 hours before a batch clears QC.";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    res.status(500).json({ step: "config", ok: false, error: String(err instanceof ConfigError ? err.message : err) });
    return;
  }

  const gemini = new GeminiClient(config.geminiApiKey, config.geminiFlashModel, config.geminiProModel);
  const report: Record<string, unknown> = {
    flashModel: config.geminiFlashModel,
    proModel: config.geminiProModel,
  };

  try {
    const triage = await gemini.triageNote(TEST_NOTE);
    report.triage = { ok: true, ...triage };
  } catch (err) {
    report.triage = { ok: false, error: serializeError(err) };
  }

  try {
    const draft = await gemini.draftPost("Write in plain, direct prose. No bullet points.", TEST_NOTE, []);
    report.draft = { ok: true, preview: draft.slice(0, 200) };
  } catch (err) {
    report.draft = { ok: false, error: serializeError(err) };
  }

  res.status(200).json(report);
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, cause: (err as any).cause };
  }
  return err;
}
