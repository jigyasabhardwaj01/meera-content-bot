// Reads and validates environment variables once per invocation. Throws with a
// clear, server-side message if anything required is missing — never exposes
// this to Telegram.

export interface Config {
  telegramBotToken: string;
  telegramUserId: number;
  telegramWebhookSecret: string | null;
  geminiApiKey: string;
  geminiFlashModel: string;
  geminiProModel: string;
  triageThreshold: number;
}

export class ConfigError extends Error {}

export function loadConfig(): Config {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value || !value.trim()) {
      throw new ConfigError(`Missing required environment variable: ${name}`);
    }
    return value.trim();
  };

  const telegramUserIdRaw = required("TELEGRAM_USER_ID");
  const telegramUserId = Number(telegramUserIdRaw);
  if (!Number.isInteger(telegramUserId)) {
    throw new ConfigError("TELEGRAM_USER_ID must be a numeric Telegram user ID");
  }

  const triageThresholdRaw = process.env.TRIAGE_THRESHOLD ?? "6";
  const triageThreshold = Number(triageThresholdRaw);
  if (Number.isNaN(triageThreshold) || triageThreshold < 0 || triageThreshold > 10) {
    throw new ConfigError("TRIAGE_THRESHOLD must be a number between 0 and 10");
  }

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    telegramUserId,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
    geminiApiKey: required("GEMINI_API_KEY"),
    geminiFlashModel: process.env.GEMINI_FLASH_MODEL?.trim() || "gemini-3.5-flash",
    geminiProModel: process.env.GEMINI_PRO_MODEL?.trim() || "gemini-2.5-pro",
    triageThreshold,
  };
}
