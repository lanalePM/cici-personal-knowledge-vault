import { JSDOM } from "jsdom";
import { GoogleGenAI } from "@google/genai";
export { SUGGESTED_FEEDS } from "./scout-constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ── RSS item type ─────────────────────────────────────────────────────────────

export type FeedArticle = {
  title: string;
  url: string;
  description: string;  // short (≤600 chars) — used for scoring + as fallback if live fetch fails
  publishedAt: string | null;
};

// ── RSS / Atom parser ─────────────────────────────────────────────────────────

function getText(el: Element | null, tag: string): string {
  return el?.querySelector(tag)?.textContent?.trim() ?? "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
}

export async function fetchFeedArticles(feedUrl: string): Promise<FeedArticle[]> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "Cici-Scout/1.0 (RSS reader)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xml = await res.text();

  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;

  // RSS 2.0
  const rssItems = Array.from(doc.querySelectorAll("item"));
  if (rssItems.length > 0) {
    return rssItems.slice(0, 20).map((item) => {
      const link =
        getText(item, "link") ||
        item.querySelector("guid")?.textContent?.trim() ||
        "";
      const description = stripHtml(
        getText(item, "description") || getText(item, "summary") || ""
      );
      const pubDate = getText(item, "pubDate") || getText(item, "published") || null;
      return {
        title: getText(item, "title"),
        url: link,
        description,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      };
    }).filter((a) => a.title && a.url);
  }

  // Atom
  const atomEntries = Array.from(doc.querySelectorAll("entry"));
  return atomEntries.slice(0, 20).map((entry) => {
    const linkEl = entry.querySelector("link[rel='alternate']") ?? entry.querySelector("link");
    const link = linkEl?.getAttribute("href") ?? getText(entry, "id") ?? "";
    const raw = getText(entry, "content") || getText(entry, "summary") || "";
    const published = getText(entry, "published") || getText(entry, "updated") || null;
    return {
      title: getText(entry, "title"),
      url: link,
      description: stripHtml(raw),
      publishedAt: published ? new Date(published).toISOString() : null,
    };
  }).filter((a) => a.title && a.url);
}

// ── Relevance scoring ─────────────────────────────────────────────────────────

export type RelevanceResult = {
  score: number;    // 1–5
  reason: string;
};

export async function scoreArticleRelevance(
  article: FeedArticle,
  interestProfile: string
): Promise<RelevanceResult> {
  const prompt = `You are a content relevance judge for a personal knowledge vault.

INTEREST PROFILE:
${interestProfile}

ARTICLE:
Title: ${article.title}
Summary: ${article.description}

Score how relevant this article is to the interest profile above.

RUBRIC (1–5):
5 = Directly on-topic, highly valuable for this profile
4 = Clearly relevant, likely interesting
3 = Somewhat related, worth a look
2 = Only tangentially related
1 = Not relevant to the interest profile

JSON only: {"score": <1-5>, "reason": "<one short sentence>"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 1024,
        temperature: 0.1,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }, // disable thinking for fast, cheap scoring
      },
    });
    const text = response.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text) as { score?: unknown; reason?: unknown };
    const score =
      typeof parsed.score === "number"
        ? Math.min(5, Math.max(1, Math.round(parsed.score)))
        : 3;
    const reason =
      typeof parsed.reason === "string"
        ? parsed.reason.slice(0, 300)
        : "No reason provided.";
    return { score, reason };
  } catch (e) {
    console.error("[scout] Gemini scoring error:", e);
    return { score: 3, reason: "Scoring unavailable." };
  }
}

// ── Interest profile builder ──────────────────────────────────────────────────
// Combines vault tags (auto) + user's manual description (optional)

export function buildInterestProfile(
  vaultTags: string[],
  manualInterests: string
): string {
  const parts: string[] = [];
  if (vaultTags.length > 0) {
    parts.push(`Topics from my knowledge vault: ${vaultTags.slice(0, 30).join(", ")}`);
  }
  if (manualInterests.trim()) {
    parts.push(`Additional interests: ${manualInterests.trim()}`);
  }
  return parts.join("\n") || "General tech and AI content";
}
