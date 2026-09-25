// Fetches an optional industry-news hook from Google News' public RSS search
// feed. No API key required. This is the "Context" component in the roadmap
// diagram (Google News → Fetches relevant industry news hook).
//
// Never fabricated: if the feed is empty, unreachable, or times out, we return
// an empty list and drafting proceeds without a news hook (see docs/BUILD_SPEC.md §14).

export interface NewsItem {
  title: string;
  publisher: string;
  publicationDate: string;
  url: string;
}

// Locale for the Google News edition to search. Defaults to India
// (https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en); override via env
// vars if Meera's audience is elsewhere.
const NEWS_HL = process.env.NEWS_HL?.trim() || "en-IN";
const NEWS_GL = process.env.NEWS_GL?.trim() || "IN";
const NEWS_CEID = process.env.NEWS_CEID?.trim() || "IN:en";

export async function fetchNewsHook(query: string, maxItems = 3): Promise<NewsItem[]> {
  const feedUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${encodeURIComponent(NEWS_HL)}&gl=${encodeURIComponent(NEWS_GL)}&ceid=${encodeURIComponent(NEWS_CEID)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseGoogleNewsRss(xml).slice(0, maxItems);
  } catch (err) {
    console.error("News fetch failed", err);
    return [];
  }
}

function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = decodeXml(extractTag(block, "title"));
    const link = decodeXml(extractTag(block, "link"));
    const pubDate = decodeXml(extractTag(block, "pubDate"));
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const publisher = sourceMatch ? decodeXml(sourceMatch[1]) : "";
    if (title && link) {
      items.push({
        title,
        publisher: publisher || "Unknown publisher",
        publicationDate: pubDate || "",
        url: link,
      });
    }
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return "";
  return match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
