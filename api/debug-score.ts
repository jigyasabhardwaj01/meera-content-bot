// TEMPORARY diagnostic endpoint — remove after verifying checkpoint B1.1.
// Runs the exact scoring guardrail (GeminiClient.triageNote) against a note
// passed in the query string, and returns the raw score/reason. No drafting,
// no Telegram involved.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadConfig, ConfigError } from "../lib/config.js";
import { GeminiClient } from "../lib/gemini.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const note = typeof req.query.note === "string" ? req.query.note : "";
  if (!note) {
    res.status(400).json({ error: "pass ?note=<url-encoded note text>" });
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err instanceof ConfigError ? err.message : err) });
    return;
  }

  const gemini = new GeminiClient(config.geminiApiKey, config.geminiFlashModel, config.geminiProModel);
  try {
    const result = await gemini.triageNote(note);
    res.status(200).json({
      ok: true,
      score: result.score,
      reason: result.reason,
      wouldDraft: result.score >= config.triageThreshold,
      threshold: config.triageThreshold,
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
