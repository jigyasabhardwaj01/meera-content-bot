import { GoogleGenAI, Type } from "@google/genai";
import type { NewsItem } from "./news.js";

export interface TriageResult {
  score: number;
  topic: string;
  searchQuery: string;
  rationale: string;
}

const TRIAGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.NUMBER,
      description: "Publishability score from 0 (not worth developing) to 10 (clearly worth a post).",
    },
    topic: { type: Type.STRING, description: "One short phrase naming the core topic of the note." },
    search_query: {
      type: Type.STRING,
      description: "A short news-search query to find a relevant, current industry hook for this topic.",
    },
    rationale: { type: Type.STRING, description: "One or two sentences explaining the score." },
  },
  required: ["score", "topic", "search_query", "rationale"],
};

export class GeminiClient {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string, private readonly flashModel: string, private readonly proModel: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** Transcribes a Telegram voice note. Verbatim — no summarising, no correcting. */
  async transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<string> {
    const base64 = Buffer.from(bytes).toString("base64");
    const response = await this.ai.models.generateContent({
      model: this.flashModel,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text:
                "Transcribe this voice note verbatim, word for word. Do not summarise, correct grammar, " +
                "or paraphrase. Return only the transcript text, nothing else.",
            },
          ],
        },
      ],
    });
    const text = response.text?.trim();
    if (!text) throw new Error("Transcription returned empty text");
    return text;
  }

  /** Scores a note 0-10 for publishability. This is the "Triage" step in the roadmap. */
  async triageNote(noteText: string): Promise<TriageResult> {
    const response = await this.ai.models.generateContent({
      model: this.flashModel,
      contents: [{ role: "user", parts: [{ text: noteText }] }],
      config: {
        systemInstruction:
          "You triage rough founder notes for whether they are worth developing into a LinkedIn post. " +
          "Score 0-10: how publishable is the underlying idea, on its own evidence, without inventing " +
          "anything. A high score needs a specific, concrete idea with something for the reader to take " +
          "away — not just an interesting fact with no point, and not something generic. Do not use " +
          "score as a proxy for how interesting the topic sounds; judge whether there is enough here to " +
          "write honestly about. Also suggest a short news-search query for a relevant current industry " +
          "hook, even if you are not sure one exists.",
        responseMimeType: "application/json",
        responseSchema: TRIAGE_SCHEMA,
      },
    });
    const raw = response.text;
    if (!raw) throw new Error("Triage returned empty response");
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Triage did not return valid JSON");
    }
    if (typeof parsed.score !== "number") {
      throw new Error("Triage response missing numeric score");
    }
    return {
      score: parsed.score,
      topic: parsed.topic ?? "",
      searchQuery: parsed.search_query ?? parsed.topic ?? "",
      rationale: parsed.rationale ?? "",
    };
  }

  /**
   * Drafts a LinkedIn post using the voice skill as the system instruction, and
   * only the supplied note + news evidence. Never told to "write a good post" —
   * only to apply the supplied voice skill to the supplied evidence
   * (docs/BUILD_SPEC.md §16).
   */
  async draftPost(voiceSkill: string, noteText: string, news: NewsItem[]): Promise<string> {
    const newsBlock =
      news.length === 0
        ? "No current external news context was found or used for this post."
        : "Available current external context (use only if it genuinely strengthens the idea; " +
          "cite specifically, never as 'studies show' or 'experts say'):\n" +
          news
            .map(
              (n, i) =>
                `${i + 1}. "${n.title}" — ${n.publisher}${n.publicationDate ? `, ${n.publicationDate}` : ""}\n   ${n.url}`
            )
            .join("\n");

    const response = await this.ai.models.generateContent({
      model: this.proModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `Meera's original note:\n"""\n${noteText}\n"""\n\n${newsBlock}\n\n` +
                "Write a LinkedIn post using the supplied Meera voice skill and only the evidence given " +
                "above. Do not invent facts, numbers, sources, studies, customer stories, product claims, " +
                "experiences, or dates that are not present in the note or the news context above. If an " +
                "external claim is used, name its source specifically. Return only the post text — no " +
                "heading, no title, no commentary about the post.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: voiceSkill,
      },
    });
    const text = response.text?.trim();
    if (!text) throw new Error("Draft generation returned empty text");
    return text;
  }
}
