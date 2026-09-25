import { GoogleGenAI, Type } from "@google/genai";
import type { NewsItem } from "./news.js";

export interface TriageResult {
  /** Integer 0-10. This is the scoring guardrail's decision value (checkpoint B1.1). */
  score: number;
  /** One concise sentence explaining the score — used verbatim in the rejection message. */
  reason: string;
  /** Supplementary fields for the existing (unchanged) news-hook step; not part of the score/reason contract. */
  topic: string;
  searchQuery: string;
}

// Strict scoring contract for checkpoint B1.1: {"score": 0, "reason": "..."} only,
// plus the two supplementary fields the existing drafting pipeline already relies
// on for its news-hook lookup (topic / search_query). The gatekeeping decision
// never reads those two fields — only score and reason.
const TRIAGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "Integer 0-10. Score ONLY what is actually present in the note, per the rubric.",
    },
    reason: {
      type: Type.STRING,
      description: "One concise sentence explaining why the note received this score. No markdown.",
    },
    topic: { type: Type.STRING, description: "One short phrase naming the core topic of the note." },
    search_query: {
      type: Type.STRING,
      description: "A short news-search query to find a relevant, current industry hook for this topic.",
    },
  },
  required: ["score", "reason", "topic", "search_query"],
};

const SCORING_RUBRIC = `You are a strict editorial gatekeeper for a founder's content pipeline, not a
helpful writing assistant. Your only job is to stop weak notes from reaching drafting.

Score the note as a single integer from 0 to 10, using exactly this rubric:

9-10 — Strong, highly substantive idea: a clear insight, argument, observation, experience, or
learning, with specific details and enough reasoning, evidence, examples, or context to develop
into meaningful content.

7-8 — Clearly draftable: a meaningful idea worth communicating, with specific context, observation,
opinion, experience, or useful information — enough substance to draft without inventing major
information.

6 — Minimum passing score: a sufficiently clear and substantive idea with enough material to create
a useful draft. Some structuring or expansion may be needed, but the core idea already exists.

4-5 — Borderline / reject: a topic or intention but underdeveloped; mostly a prompt to self rather
than actual content; insufficient substance to create meaningful content without inventing
information.

1-3 — Reject: a task/reminder, scheduling/logistics, an abandoned sentence, a fragment with no
developed idea, or a generic thought with no explanation or context. Examples: "write about
sunscreen tomorrow", "Need to talk about peptides", "Maybe do something on this", "Remind me to
post this".

0 — No usable content: empty, unintelligible, an accidental message, or purely logistical content.

Critical rules:
1. Score only what is actually present in the note.
2. Do NOT score based on what the note could become.
3. A topic alone is NOT substantive.
4. A future intention is NOT substantive.
5. A task/reminder is NOT substantive.
6. Do NOT infer missing facts, arguments, examples, experiences, or opinions.
7. Do NOT reward a note merely because it mentions skincare, formulation, Meera, or an interesting
   subject.
8. If significant information would have to be invented to create a useful draft, the score MUST be
   below 6.
9. Be conservative around the 6-point threshold.
10. The purpose of this step is to prevent weak notes from entering the drafting pipeline.

Also suggest a short news-search query and a one-phrase topic for a relevant current industry hook,
even if you are not sure one exists — these two fields do not affect the score.`;

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

  /**
   * Scoring guardrail (checkpoint B1.1) — strict editorial gate run before drafting.
   * Fails closed: any malformed/out-of-contract response throws rather than
   * silently letting a note through (the caller must not draft on a thrown error).
   */
  async triageNote(noteText: string): Promise<TriageResult> {
    const response = await this.ai.models.generateContent({
      model: this.flashModel,
      contents: [{ role: "user", parts: [{ text: noteText }] }],
      config: {
        systemInstruction: SCORING_RUBRIC,
        responseMimeType: "application/json",
        responseSchema: TRIAGE_SCHEMA,
      },
    });
    const raw = response.text;
    if (!raw) throw new Error("Scoring returned empty response");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Scoring did not return valid JSON");
    }

    // Strict validation — score must be an integer 0-10, and reason a non-empty
    // string. Anything else fails closed rather than risk a bad score bypassing
    // the guardrail (e.g. out-of-range, a float, a string, NaN).
    if (typeof parsed.score !== "number" || !Number.isInteger(parsed.score)) {
      throw new Error("Scoring response's score was not an integer");
    }
    if (parsed.score < 0 || parsed.score > 10) {
      throw new Error("Scoring response's score was out of the 0-10 range");
    }
    if (typeof parsed.reason !== "string" || !parsed.reason.trim()) {
      throw new Error("Scoring response was missing a reason");
    }

    return {
      score: parsed.score,
      reason: parsed.reason.trim(),
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
      searchQuery: typeof parsed.search_query === "string" ? parsed.search_query : (parsed.topic ?? ""),
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
