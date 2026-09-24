// Quick post-deploy sanity check: GET /api/health -> "ok" if the function is
// reachable and required env vars are present. Does not call Telegram or Gemini.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadConfig, ConfigError } from "../lib/config.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    loadConfig();
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof ConfigError ? err.message : "misconfigured" });
  }
}
