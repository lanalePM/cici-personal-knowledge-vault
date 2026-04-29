import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429");
      if (!isRateLimit || attempt === maxRetries) throw err;

      const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.log(`[AI] Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

interface SummaryResult {
  summary: string;
  tags: string[];
}

export type GenerateSummaryOptions = {
  /** User's existing tag names — model should reuse exact strings when they fit */
  existingTags?: string[];
};

export async function generateSummaryAndTags(
  content: string,
  contentType: "text" | "image",
  imageUrl?: string,
  options?: GenerateSummaryOptions
): Promise<SummaryResult> {
  const existingTags = options?.existingTags ?? [];
  const existingTagsBlock =
    existingTags.length > 0
      ? `

The user already has these tags in their vault (comma-separated). When one or more clearly apply to this content, reuse the tag text EXACTLY as shown — same spelling and wording — instead of inventing a synonym or abbreviation (e.g. prefer an existing "large language models" over new "llm" or "language models").
Existing tags: ${existingTags.join(", ")}

If none fit well, you may suggest 2-3 new tags following the vocabulary rules below.`
      : "";

  const systemInstruction = `You are a helpful assistant that summarizes content and suggests tags for a personal knowledge management system.

Given the content, provide:
1. A concise summary (3-5 sentences, ~100-150 words) that captures the key ideas.
2. Exactly 2-3 relevant tags total. Tags must be: lowercase; no "#" prefix; prefer short noun phrases (1-3 words); be consistent — avoid near-duplicates like "llm" vs "llms" vs "language models" — pick ONE clear label per topic.${existingTagsBlock}

Vocabulary rules when creating new tags: use full readable phrases where helpful (e.g. "large language models" not "llm"); singular topic names unless plural is standard ("apis" OK); no hashtags.

Respond in JSON format only:
{"summary": "...", "tags": ["tag1", "tag2", ...]}`;

  let userContent: string;

  if (contentType === "image" && imageUrl) {
    userContent =
      "Describe and summarize this image. What is it about? Suggest relevant tags.\n\nImage URL: " +
      imageUrl;
  } else {
    const truncated =
      content.length > 100000 ? content.slice(0, 100000) + "..." : content;
    userContent = `Summarize the following content and suggest tags.\n\n${truncated}`;
  }

  if (existingTagsBlock) {
    userContent =
      userContent +
      "\n\nRemember: reuse matching tags from the user's existing list verbatim when appropriate.";
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userContent,
      config: {
        systemInstruction,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    })
  );

  const text = response.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }

  return { summary: text.slice(0, 500), tags: [] };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, 8000);

  const response = await withRetry(() =>
    ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: truncated,
      config: {
        outputDimensionality: 768,
      },
    })
  );

  return response.embeddings?.[0]?.values ?? [];
}

export type AskCiciContextBlock =
  | {
      kind: "chunk";
      id: string;
      item_id: string;
      title: string;
      chunk_index: number;
      body: string;
    }
  | {
      kind: "item";
      id: string;
      item_id: string;
      title: string;
      body: string;
    };

export async function generateAskCiciAnswer(options: {
  scope: string;
  userMessage: string;
  blocks: AskCiciContextBlock[];
  history?: { role: "user" | "assistant"; content: string }[];
  deepDive?: boolean;
}): Promise<{ answer: string; cited_ids: string[] }> {
  const { scope, userMessage, blocks, history, deepDive } = options;
  const allowedBlockIds = new Set(blocks.map((b) => b.id));
  const looksTruncated = (value: string) => {
    const t = value.trim();
    if (t.length < 280) return false;
    if (/\.\s*(,\s*){2,}$/.test(t)) return true;
    if (/(,\s*|:\s*|;\s*|-+\s*|\(\s*)$/.test(t)) return true;
    return !/[.!?)]["']?$/.test(t);
  };

  const contextText = blocks
    .map((b) => {
      const head =
        b.kind === "chunk"
          ? `[${b.id}] item="${b.title}" chunk=${b.chunk_index}`
          : `[${b.id}] item="${b.title}" (summary bundle)`;
      return `${head}\n${b.body}`;
    })
    .join("\n\n---\n\n");

  const historyText = (history || [])
    .slice(-8)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const systemInstruction = deepDive
    ? `You are Ask Cici in Deep Dive mode — a personal learning assistant helping the user deeply understand a specific saved article.

You have been given the FULL TEXT of the article as CONTEXT. Use it thoroughly.

Rules:
- Base all factual claims on the provided CONTEXT. Include the context block id(s) you used in cited_ids.
- Never invent content not present in the article.
- Act as an expert tutor: explain clearly, use analogies, connect ideas, highlight what's important and why.
- When explaining concepts, go beyond definitions — explain the intuition, real-world impact, or a concrete example.
- For "what should I do" or "action steps" questions, be specific and practical.
- For "explain" or "what does X mean" questions, use a structured breakdown: plain-English definition → why it matters → example if helpful.
- Write clean, readable markdown: use ## headings, bullet lists, **bold** for key terms.
- Keep paragraphs short (1–3 sentences). Avoid dense walls of text.
- End every answer cleanly — never stop mid-sentence or mid-list.
- Do NOT print raw block ids like [uuid] in the answer text; put them only in cited_ids.

Respond ONLY with JSON:
{"answer":"...","cited_ids":["id1","id2"]}`
    : `You are Ask Cici, a grounded assistant for the user's personal vault.

Rules:
- Use ONLY the provided CONTEXT blocks to support factual claims about saved material.
- CONTEXT blocks are labeled with bracket ids like [chunk-uuid] or [item-uuid]. When you rely on a block, include its id in cited_ids.
- If CONTEXT is insufficient to answer, say so clearly and suggest what to save or ask next. Do not invent vault contents.
- scope=${scope}: for "synthesis", focus on themes across items; for "topic", synthesize across chunks; for "item", answer about one saved item.
- Be comprehensive and practical. Do not undershoot detail for broad or learning-oriented questions.
- Write clean markdown for readability:
  - Always use short sections with headings and bullet lists.
  - For terminology-style questions, use a list where each bullet starts with **Term** - plain-English explanation.
  - Add why-it-matters context or a brief example for important terms when relevant.
  - Keep paragraphs short (1-3 sentences each), avoid one dense block.
  - When the question is broad, include 8-15 key bullets unless context is too limited.
- Never print raw retrieval block ids in the answer text (do not show strings like [uuid] or [bundle-...]); put citations only in cited_ids.
- Ensure the answer ends cleanly with a complete final sentence (never stop mid-list or mid-sentence).

Respond ONLY with JSON:
{"answer":"...","cited_ids":["id1","id2"]}

If nothing applies, cited_ids may be empty and answer explains the gap.`;

  const contents = [
    historyText ? `Prior turns:\n${historyText}\n\n` : "",
    `CONTEXT:\n${contextText || "(empty — no retrieved content)"}`,
    `\n\nUSER QUESTION:\n${userMessage}`,
  ].join("");

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    })
  );

  const text = response.text ?? "{}";
  const parseModelJson = (raw: string): { answer: string; cited_ids: string[] } | null => {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const directCandidates = [cleaned];
    const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) directCandidates.push(jsonObjectMatch[0]);

    for (const candidate of directCandidates) {
      try {
        const parsed = JSON.parse(candidate) as {
          answer?: string;
          cited_ids?: unknown;
        };
        if (typeof parsed.answer === "string") {
          return {
            answer: parsed.answer,
            cited_ids: Array.isArray(parsed.cited_ids)
              ? parsed.cited_ids.filter((x): x is string => typeof x === "string")
              : [],
          };
        }
      } catch {
        /* continue to fallback parser */
      }
    }

    // Fallback for partially malformed JSON: extract answer string manually.
    const answerField = cleaned.match(
      /"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"cited_ids"\s*:/i
    );
    if (answerField?.[1]) {
      try {
        const decoded = JSON.parse(`"${answerField[1]}"`) as string;
        const idsMatch = cleaned.match(/"cited_ids"\s*:\s*\[([\s\S]*?)\]/i);
        const cited_ids =
          idsMatch?.[1]
            ?.split(",")
            .map((s) => s.trim())
            .map((s) => s.replace(/^"|"$/g, ""))
            .filter(Boolean) || [];

        return { answer: decoded, cited_ids };
      } catch {
        return { answer: answerField[1], cited_ids: [] };
      }
    }

    return null;
  };

  const looksLikeCitationToken = (s: string) =>
    allowedBlockIds.has(s) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ||
    /^bundle-/i.test(s);

  const sanitizeAnswer = (value: string) =>
    value
      .replace(/\[([^\]]+)\]/g, (match, inner: string) => {
        const tokens = inner.split(",").map((s) => s.trim()).filter(Boolean);
        return tokens.length > 0 && tokens.every(looksLikeCitationToken) ? "" : match;
      })
      .replace(/\s+\./g, ".")
      .replace(/\.\s*(,\s*){1,}/g, ". ")
      .replace(/,\s*(,\s*)+/g, ", ")
      .replace(/\(\s*,\s*/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s{2,}/g, " ")
      .trim();

  const requestContinuation = async (partialAnswer: string): Promise<string> => {
    const continuationPrompt = [
      `You are continuing an unfinished answer for the same user question.`,
      `Continue from where this left off. Do not repeat any earlier text.`,
      `Output must be clean markdown and complete the thought with a natural ending.`,
      `Return JSON only: {"continuation":"..."}.`,
      ``,
      `USER QUESTION:`,
      userMessage,
      ``,
      `CURRENT PARTIAL ANSWER:`,
      partialAnswer,
      ``,
      `CONTEXT:`,
      contextText || "(empty)",
    ].join("\n");

    const continuationRes = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: continuationPrompt,
        config: {
          maxOutputTokens: 1536,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      })
    );

    const raw = continuationRes.text ?? "";
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const obj = JSON.parse(m ? m[0] : raw) as { continuation?: string };
      if (typeof obj.continuation === "string") return sanitizeAnswer(obj.continuation);
    } catch {
      // fall through
    }
    return sanitizeAnswer(
      raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .replace(/^\s*\{\s*"continuation"\s*:\s*"/i, "")
        .replace(/"\s*\}\s*$/i, "")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
    );
  };

  const parsed = parseModelJson(text);
  if (parsed) {
    let cleanedAnswer = sanitizeAnswer(parsed.answer);
    if (looksTruncated(cleanedAnswer)) {
      const continuation = await requestContinuation(cleanedAnswer);
      if (continuation) {
        cleanedAnswer = sanitizeAnswer(`${cleanedAnswer}\n\n${continuation}`);
      }
    }
    return {
      answer: cleanedAnswer,
      cited_ids: parsed.cited_ids.filter((id) => allowedBlockIds.has(id)),
    };
  }

  // Last resort: strip common JSON envelope tokens instead of showing raw object.
  const plainFallback = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .replace(/^\s*\{\s*"answer"\s*:\s*"/i, "")
    .replace(/"\s*,\s*"cited_ids"\s*:\s*\[[\s\S]*?\]\s*\}\s*$/i, "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n");

  let fallbackAnswer = sanitizeAnswer(plainFallback);
  if (looksTruncated(fallbackAnswer)) {
    const continuation = await requestContinuation(fallbackAnswer);
    if (continuation) {
      fallbackAnswer = sanitizeAnswer(`${fallbackAnswer}\n\n${continuation}`);
    }
  }
  return { answer: fallbackAnswer, cited_ids: [] };
}
