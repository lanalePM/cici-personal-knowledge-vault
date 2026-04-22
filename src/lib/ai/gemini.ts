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

export async function generateSummaryAndTags(
  content: string,
  contentType: "text" | "image",
  imageUrl?: string
): Promise<SummaryResult> {
  const systemInstruction = `You are a helpful assistant that summarizes content and suggests tags for a personal knowledge management system.

Given the content, provide:
1. A concise summary (3-5 sentences, ~100-150 words) that captures the key ideas.
2. Exactly 2-3 relevant tags (lowercase, single words or short phrases, no # prefix). Pick only the most essential topics.

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
    userContent = `Summarize the following content and suggest tags:\n\n${truncated}`;
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
