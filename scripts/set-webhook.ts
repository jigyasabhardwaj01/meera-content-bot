// One-off helper: point your Telegram bot at your Vercel deployment.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... DEPLOYMENT_URL=https://your-app.vercel.app \
//     [TELEGRAM_WEBHOOK_SECRET=...] npx tsx scripts/set-webhook.ts

export {}; // make this a module so top-level await is allowed

interface SetWebhookResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const deploymentUrl = process.env.DEPLOYMENT_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !deploymentUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and DEPLOYMENT_URL environment variables first.");
  process.exit(1);
}

const url = new URL("/api/telegram", deploymentUrl).toString();

const body: Record<string, string> = { url };
if (secret) body.secret_token = secret;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const json = (await res.json()) as SetWebhookResponse;
console.log(JSON.stringify(json, null, 2));
if (!json.ok) process.exit(1);
