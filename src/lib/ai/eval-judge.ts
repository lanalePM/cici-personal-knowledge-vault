import { GoogleGenAI } from "@google/genai";
export type { EvalDimension } from "./eval-types";
export { DIMENSION_LABELS } from "./eval-types";
import type { EvalDimension } from "./eval-types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export type JudgeResult = {
  score: number; // 1–5
  reasoning: string;
};

async function callJudge(prompt: string): Promise<JudgeResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text) as {
      score?: unknown;
      reasoning?: unknown;
    };

    const score =
      typeof parsed.score === "number"
        ? Math.min(5, Math.max(1, Math.round(parsed.score)))
        : 3;
    const reasoning =
      typeof parsed.reasoning === "string"
        ? parsed.reasoning.slice(0, 400)
        : "No reasoning provided.";

    return { score, reasoning };
  } catch {
    return { score: 3, reasoning: "Judge call failed — defaulting to neutral score." };
  }
}

// ── Individual dimension judges ───────────────────────────────────────────────

export function judgeSummaryFaithfulness(
  source: string,
  summary: string
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score this AI summary on FAITHFULNESS to the source.

RUBRIC (1–5):
5 = Every claim is directly supported by the source
4 = Almost all claims supported; at most one minor extrapolation
3 = Most claims supported; one or two not in the source
2 = Several unsupported or distorted claims
1 = Significant hallucination — major claims not in the source

SOURCE (first 3000 chars):
${source.slice(0, 3000)}

SUMMARY:
${summary}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

export function judgeSummaryCoverage(
  source: string,
  summary: string
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score this AI summary on COVERAGE of the source's key ideas.

RUBRIC (1–5):
5 = All major ideas and conclusions are represented
4 = Most major ideas present; one minor point missing
3 = Core topic captured but several important ideas missing
2 = Only superficial aspects covered; misses the main argument
1 = Summary does not represent the source's key content

SOURCE (first 3000 chars):
${source.slice(0, 3000)}

SUMMARY:
${summary}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

export function judgeTagRelevance(
  summary: string,
  tags: string[]
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score these AI-generated tags on RELEVANCE to the content.

RUBRIC (1–5):
5 = All tags accurately describe the content's topic
4 = Most tags relevant; one is tangential
3 = Half the tags are relevant; others are vague or off-topic
2 = Most tags don't describe the content well
1 = Tags are unrelated to the content

CONTENT SUMMARY:
${summary}

TAGS: ${tags.join(", ")}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

export function judgeTagSpecificity(
  summary: string,
  tags: string[]
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score these AI-generated tags on SPECIFICITY — are they precise and useful, or vague filler?

RUBRIC (1–5):
5 = All tags are specific and meaningful (e.g. "reinforcement learning", "product-market fit")
4 = Mostly specific; one tag slightly broad
3 = Mix of specific and generic
2 = Most tags too broad to be useful (e.g. "technology", "article")
1 = All tags are generic filler

CONTENT SUMMARY:
${summary}

TAGS: ${tags.join(", ")}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

export function judgeAnswerFaithfulness(
  question: string,
  answer: string,
  context: string
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score this RAG answer on FAITHFULNESS — does it stay grounded in the provided context?

RUBRIC (1–5):
5 = Every claim is directly supported by the context
4 = Almost fully grounded; minor extrapolation that doesn't mislead
3 = Mostly grounded but one or two claims go beyond the context
2 = Several claims not in the context
1 = Answer invents significant content not in the context

QUESTION:
${question}

CONTEXT (first 3000 chars):
${context.slice(0, 3000)}

ANSWER:
${answer}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

export function judgeAnswerRelevance(
  question: string,
  answer: string
): Promise<JudgeResult> {
  return callJudge(`You are an expert AI evaluator. Score this answer on RELEVANCE — does it actually address what was asked?

RUBRIC (1–5):
5 = Directly and completely answers the question
4 = Answers the main question with minor tangents
3 = Partially answers; misses some aspects
2 = Addresses the topic but not the specific question
1 = Does not answer the question asked

QUESTION:
${question}

ANSWER:
${answer}

JSON only: {"score": <1-5>, "reasoning": "<one sentence>"}`);
}

// ── Scout relevance accuracy judge ───────────────────────────────────────────
// Evaluates whether the scout's relevance score was well-calibrated.
// "scoutScore" is what the agent assigned (1–5).
// "userDecision" is what the user actually did: "saved" (confirmed relevant)
// or "dismissed" (rejected as not relevant) — acts as ground truth.

export function judgeScoutRelevance(
  interestProfile: string,
  articleTitle: string,
  articleDescription: string,
  scoutScore: number,
  userDecision: "saved" | "dismissed"
): Promise<JudgeResult> {
  const expectedDirection =
    userDecision === "saved" ? "high (4 or 5)" : "low (1 or 2)";

  return callJudge(`You are an expert AI evaluator assessing a content scout agent.

The scout was given this INTEREST PROFILE:
${interestProfile}

It scored the following article ${scoutScore}/5 for relevance:
Title: ${articleTitle}
Description: ${articleDescription}

The user later ${userDecision === "saved" ? "SAVED this article to their vault" : "DISMISSED this article as not relevant"}.
This means the expected relevance score should have been ${expectedDirection}.

Score how well-calibrated the scout's score was:

RUBRIC (1–5):
5 = Scout's score perfectly matched user's decision (saved → scored 4–5, dismissed → scored 1–2)
4 = Scout's score was close — right direction, slightly off (e.g. saved → scored 3, dismissed → scored 3)
3 = Scout's score was in the right direction but significantly off (e.g. saved → scored 2)
2 = Scout's score was wrong direction (e.g. saved item scored 1–2, dismissed item scored 4–5)
1 = Scout completely misjudged — high confidence in the wrong direction

JSON only: {"score": <1-5>, "reasoning": "<one sentence explaining the calibration error or success>"}`);
}

// ── Batch runner ──────────────────────────────────────────────────────────────
// Runs multiple judge calls concurrently and returns settled results,
// so one failing call doesn't abort the whole batch.

export async function runDimensionBatch(
  calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[]
): Promise<{ dimension: EvalDimension; result: JudgeResult }[]> {
  const settled = await Promise.allSettled(calls.map((c) => c.promise));
  return settled.map((s, i) => ({
    dimension: calls[i].dimension,
    result:
      s.status === "fulfilled"
        ? s.value
        : { score: 3, reasoning: "Judge call failed." },
  }));
}
