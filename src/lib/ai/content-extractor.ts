import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

export type ExtractionSource = "full_article" | "og_meta";

export interface ExtractedContent {
  title: string;
  content: string;
  source: ExtractionSource;
}

async function fetchHtml(url: string, userAgent: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseWithReadability(html: string, url: string): { title: string; content: string } | null {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", () => {});

  const dom = new JSDOM(html, { url, virtualConsole });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent?.trim()) return null;
  return { title: article.title || "", content: article.textContent.trim() };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractOgMeta(html: string): Record<string, string> {
  const metas: Record<string, string> = {};

  // property="..." content="..."
  const pattern1 = /<meta\s+(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*)["']/gi;
  let match;
  while ((match = pattern1.exec(html)) !== null) {
    metas[match[1]] = decodeHtmlEntities(match[2]);
  }

  // content="..." property="..." (reversed attribute order)
  const pattern2 = /<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']([^"']+)["']/gi;
  while ((match = pattern2.exec(html)) !== null) {
    metas[match[2]] = decodeHtmlEntities(match[1]);
  }

  return metas;
}

const USER_AGENTS = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  bot: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
};

export async function extractContentFromUrl(
  url: string
): Promise<ExtractedContent | null> {
  // Strategy 1: Fetch with Chrome UA + Readability (works for most sites)
  const html = await fetchHtml(url, USER_AGENTS.chrome);
  if (html) {
    const article = parseWithReadability(html, url);
    if (article && article.content.length > 100) {
      return { ...article, source: "full_article" };
    }

    // Even if Readability failed, check og:meta in this response
    const ogFromChrome = extractOgMeta(html);
    if (ogFromChrome["og:description"]) {
      return {
        title: ogFromChrome["og:title"] || "",
        content: [ogFromChrome["og:title"], ogFromChrome["og:description"]].filter(Boolean).join("\n\n"),
        source: "og_meta",
      };
    }
  }

  // Strategy 2: Fetch with bot UA (social platforms serve og:tags to crawlers)
  const botHtml = await fetchHtml(url, USER_AGENTS.bot);
  if (botHtml) {
    // Try Readability first on bot response too
    const article = parseWithReadability(botHtml, url);
    if (article && article.content.length > 100) {
      return { ...article, source: "full_article" };
    }

    const og = extractOgMeta(botHtml);
    if (og["og:description"] || og["description"]) {
      return {
        title: og["og:title"] || "",
        content: [og["og:title"], og["og:description"] || og["description"]].filter(Boolean).join("\n\n"),
        source: "og_meta",
      };
    }
  }

  return null;
}

export async function extractTextFromPdf(
  fileUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || null;
  } catch {
    return null;
  }
}
