// Thin wrapper around the Telegram Bot API — just the methods this bot needs.
// No polling library: Vercel is a webhook target, so we only ever call out.

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number };
  from?: { id: number };
  text?: string;
  voice?: { file_id: string; mime_type?: string; duration?: number; file_size?: number };
  audio?: { file_id: string; mime_type?: string };
}

export class TelegramClient {
  private readonly base: string;

  constructor(private readonly botToken: string) {
    this.base = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    // Telegram messages are capped at 4096 chars; split long drafts rather than truncate.
    const chunks = splitForTelegram(text);
    for (const chunk of chunks) {
      const res = await fetch(`${this.base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Telegram sendMessage failed", res.status, body);
      }
    }
  }

  /** Downloads a Telegram file (e.g. a voice note) and returns its raw bytes + mime type. */
  async downloadFile(fileId: string, fallbackMime = "audio/ogg"): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const infoRes = await fetch(`${this.base}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!infoRes.ok) {
      throw new Error(`Telegram getFile failed with status ${infoRes.status}`);
    }
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string } };
    const filePath = info.result?.file_path;
    if (!info.ok || !filePath) {
      throw new Error("Telegram getFile returned no file_path");
    }
    const fileRes = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${filePath}`);
    if (!fileRes.ok) {
      throw new Error(`Telegram file download failed with status ${fileRes.status}`);
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeType = ext === "oga" || ext === "ogg" ? "audio/ogg" : fallbackMime;
    return { bytes: buf, mimeType };
  }
}

function splitForTelegram(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}
