import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

/**
 * Loads the voice skill from meera_voice.txt at the project root. This file is
 * the only voice authority (see docs/BUILD_SPEC.md §2, §9) — nothing here
 * approximates or overrides its rules in code.
 */
export function loadVoiceSkill(): string {
  if (cached) return cached;
  const path = join(process.cwd(), "meera_voice.txt");
  try {
    cached = readFileSync(path, "utf-8");
  } catch {
    throw new Error(
      "meera_voice.txt not found at the project root. Add the voice skill file before drafting."
    );
  }
  return cached;
}
