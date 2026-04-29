import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const maxDuration = 30;

// GET /api/items/[id]/prompts
// Returns 4 article-specific questions generated from the item's title + summary.
// These populate the Deep Dive suggested-question chips in ChatPanel.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: item, error } = await supabase
    .from("items")
    .select("id, title, summary")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const title = (item.title as string) || "Untitled";
  const summary = (item.summary as string) || "";

  if (!summary || summary.length < 30) {
    // No summary yet — return generic item prompts
    return NextResponse.json({
      prompts: [
        "Give me a detailed breakdown: core ideas, assumptions, and caveats.",
        "What are the most important terms and what do they mean?",
        "What should I do next after reading this? Give me concrete action steps.",
        "What questions does this content leave unanswered?",
      ],
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `You are helping a user learn deeply from a saved article.

Article title: ${title}

Article summary:
${summary.slice(0, 1000)}

Generate exactly 4 thoughtful questions a curious learner would want to ask about this specific article. The questions should:
- Be specific to THIS article's content (not generic)
- Span different angles: concepts, implications, practical use, critical thinking
- Be conversational and direct (start with "What", "How", "Why", "Can you", etc.)
- Each be under 12 words

Return JSON only: {"prompts": ["question1", "question2", "question3", "question4"]}`,
      config: {
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        temperature: 0.4,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text) as { prompts?: unknown };

    if (Array.isArray(parsed.prompts) && parsed.prompts.length > 0) {
      const prompts = parsed.prompts
        .filter((p): p is string => typeof p === "string")
        .slice(0, 4);
      return NextResponse.json({ prompts });
    }
  } catch (e) {
    console.error("[prompts] Gemini call failed:", e);
  }

  // Fallback
  return NextResponse.json({
    prompts: [
      "Give me a detailed breakdown: core ideas, assumptions, and caveats.",
      "What are the most important terms and what do they mean?",
      "What should I do next after reading this? Give me concrete action steps.",
      "What questions does this content leave unanswered?",
    ],
  });
}
