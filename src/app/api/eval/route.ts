import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  judgeSummaryFaithfulness,
  judgeSummaryCoverage,
  judgeTagRelevance,
  judgeTagSpecificity,
  judgeAnswerFaithfulness,
  judgeAnswerRelevance,
  judgeScoutRelevance,
  runDimensionBatch,
  type EvalDimension,
  type JudgeResult,
} from "@/lib/ai/eval-judge";
import { buildInterestProfile } from "@/lib/ai/scout";

export const maxDuration = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

type EvalMode = "vault" | "chat" | "dataset" | "scout";

type DatasetCase =
  | {
      type: "summarization";
      label: string;
      source: string;
      summary: string;
      tags?: string[];
    }
  | {
      type: "rag";
      label: string;
      question: string;
      context: string;
      answer: string;
    }
  | {
      type: "scout";
      label: string;
      interest_profile: string;
      article_title: string;
      article_description: string;
      expected_decision: "saved" | "dismissed"; // ground truth
    };

type ResultRow = {
  subject_type: "item" | "chat_turn" | "dataset_case" | "scout_suggestion";
  subject_id: string;
  subject_label: string;
  dimension: EvalDimension;
  score: number;
  reasoning: string;
};

// ── GET — list past eval runs ─────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: runs } = await supabase
    .from("eval_runs")
    .select("id, mode, status, item_count, avg_scores, error, created_at, completed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ runs: runs || [] });
}

// ── POST — trigger a new eval run ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { mode?: EvalMode; sample_size?: number; dataset?: DatasetCase[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode: EvalMode = body.mode || "vault";
  const sampleSize = Math.min(Math.max(Number(body.sample_size) || 10, 1), 20);

  // Create the run record
  const { data: run, error: runErr } = await supabase
    .from("eval_runs")
    .insert({ user_id: user.id, mode, status: "running" })
    .select("id")
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: "Failed to create eval run" }, { status: 500 });
  }

  const runId = run.id;
  const results: ResultRow[] = [];

  try {
    if (mode === "vault") {
      await runVaultEval(supabase, user.id, sampleSize, results);
    } else if (mode === "chat") {
      await runChatEval(supabase, user.id, sampleSize, results);
    } else if (mode === "scout") {
      await runScoutEval(supabase, user.id, sampleSize, results);
    } else if (mode === "dataset") {
      if (!Array.isArray(body.dataset) || body.dataset.length === 0) {
        return NextResponse.json({ error: "dataset array required" }, { status: 400 });
      }
      await runDatasetEval(body.dataset, results);
    }

    // Persist results
    if (results.length > 0) {
      await supabase.from("eval_results").insert(
        results.map((r) => ({ ...r, run_id: runId, user_id: user.id }))
      );
    }

    // Compute avg scores per dimension
    const scoresByDimension: Record<string, number[]> = {};
    for (const r of results) {
      if (!scoresByDimension[r.dimension]) scoresByDimension[r.dimension] = [];
      scoresByDimension[r.dimension].push(r.score);
    }
    const avgScores: Record<string, number> = {};
    for (const [dim, scores] of Object.entries(scoresByDimension)) {
      avgScores[dim] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }

    // Count unique subjects
    const subjectIds = new Set(results.map((r) => r.subject_id));

    await supabase
      .from("eval_runs")
      .update({
        status: "done",
        item_count: subjectIds.size,
        avg_scores: avgScores,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return NextResponse.json({ run_id: runId, avg_scores: avgScores, item_count: subjectIds.size });
  } catch (e) {
    console.error("Eval run failed:", e);
    await supabase
      .from("eval_runs")
      .update({ status: "failed", error: String(e) })
      .eq("id", runId);

    return NextResponse.json({ error: "Eval run failed" }, { status: 500 });
  }
}

// ── Vault eval ────────────────────────────────────────────────────────────────

async function runVaultEval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sampleSize: number,
  results: ResultRow[]
) {
  const { data: items } = await supabase
    .from("items")
    .select("id, title, content_type, content_ref, page_text, summary")
    .eq("user_id", userId)
    .eq("status", "ready")
    .not("summary", "is", null)
    .order("created_at", { ascending: false })
    .limit(sampleSize);

  if (!items || items.length === 0) return;

  // Fetch tags for these items
  const itemIds = items.map((i) => i.id);
  const { data: itemTagRows } = await supabase
    .from("item_tags")
    .select("item_id, tags(name)")
    .in("item_id", itemIds);

  const tagsByItem = new Map<string, string[]>();
  for (const row of itemTagRows || []) {
    const name = (row.tags as unknown as { name: string } | null)?.name;
    if (!name) continue;
    const arr = tagsByItem.get(row.item_id) || [];
    arr.push(name);
    tagsByItem.set(row.item_id, arr);
  }

  for (const item of items) {
    const summary = item.summary as string;
    const tags = tagsByItem.get(item.id) || [];
    const label = (item.title as string) || "Untitled";
    const subjectId = item.id as string;

    // Determine source text for faithfulness/coverage
    let sourceText: string | null = null;
    if (item.page_text) {
      sourceText = item.page_text as string;
    } else if (item.content_type === "selected_text" && item.content_ref) {
      sourceText = item.content_ref as string;
    }

    const calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[] = [];

    if (sourceText && sourceText.length > 100) {
      calls.push({ dimension: "summary_faithfulness", promise: judgeSummaryFaithfulness(sourceText, summary) });
      calls.push({ dimension: "summary_coverage", promise: judgeSummaryCoverage(sourceText, summary) });
    }

    if (tags.length > 0) {
      calls.push({ dimension: "tag_relevance", promise: judgeTagRelevance(summary, tags) });
      calls.push({ dimension: "tag_specificity", promise: judgeTagSpecificity(summary, tags) });
    }

    if (calls.length === 0) continue;

    const settled = await runDimensionBatch(calls);
    for (const { dimension, result } of settled) {
      results.push({
        subject_type: "item",
        subject_id: subjectId,
        subject_label: label,
        dimension,
        score: result.score,
        reasoning: result.reasoning,
      });
    }
  }
}

// ── Chat eval ─────────────────────────────────────────────────────────────────

async function runChatEval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sampleSize: number,
  results: ResultRow[]
) {
  // Get recent assistant messages
  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!threads || threads.length === 0) return;

  const threadIds = threads.map((t) => t.id);

  const { data: assistantMsgs } = await supabase
    .from("chat_messages")
    .select("id, thread_id, content, created_at")
    .in("thread_id", threadIds)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(sampleSize);

  if (!assistantMsgs || assistantMsgs.length === 0) return;

  for (const asstMsg of assistantMsgs) {
    // Find the user message that preceded this assistant message
    const { data: userMsg } = await supabase
      .from("chat_messages")
      .select("id, content")
      .eq("thread_id", asstMsg.thread_id)
      .eq("role", "user")
      .lt("created_at", asstMsg.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!userMsg) continue;

    const question = userMsg.content as string;
    const answer = asstMsg.content as string;

    // Fetch cited items for context
    const { data: srcRows } = await supabase
      .from("chat_message_sources")
      .select("item_id")
      .eq("message_id", asstMsg.id)
      .limit(5);

    let context = "";
    if (srcRows && srcRows.length > 0) {
      const srcItemIds = srcRows.map((r) => r.item_id);
      const { data: srcItems } = await supabase
        .from("items")
        .select("title, summary")
        .in("id", srcItemIds);

      context = (srcItems || [])
        .map((it) => `${it.title || "Untitled"}\n${it.summary || ""}`)
        .join("\n\n---\n\n");
    }

    const label = question.length > 80 ? `${question.slice(0, 80)}…` : question;

    const calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[] = [
      { dimension: "answer_relevance", promise: judgeAnswerRelevance(question, answer) },
    ];

    if (context.length > 50) {
      calls.push({
        dimension: "answer_faithfulness",
        promise: judgeAnswerFaithfulness(question, answer, context),
      });
    }

    const settled = await runDimensionBatch(calls);
    for (const { dimension, result } of settled) {
      results.push({
        subject_type: "chat_turn",
        subject_id: asstMsg.id as string,
        subject_label: label,
        dimension,
        score: result.score,
        reasoning: result.reasoning,
      });
    }
  }
}

// ── Dataset eval ──────────────────────────────────────────────────────────────

async function runDatasetEval(dataset: DatasetCase[], results: ResultRow[]) {
  for (let i = 0; i < dataset.length; i++) {
    const c = dataset[i];
    const subjectId = String(i);
    const label = c.label || `Case ${i + 1}`;

    if (c.type === "summarization") {
      const calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[] = [
        { dimension: "summary_faithfulness", promise: judgeSummaryFaithfulness(c.source, c.summary) },
        { dimension: "summary_coverage", promise: judgeSummaryCoverage(c.source, c.summary) },
      ];
      if (c.tags && c.tags.length > 0) {
        calls.push({ dimension: "tag_relevance", promise: judgeTagRelevance(c.summary, c.tags) });
        calls.push({ dimension: "tag_specificity", promise: judgeTagSpecificity(c.summary, c.tags) });
      }

      const settled = await runDimensionBatch(calls);
      for (const { dimension, result } of settled) {
        results.push({
          subject_type: "dataset_case",
          subject_id: subjectId,
          subject_label: label,
          dimension,
          score: result.score,
          reasoning: result.reasoning,
        });
      }
    } else if (c.type === "rag") {
      const calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[] = [
        { dimension: "answer_relevance", promise: judgeAnswerRelevance(c.question, c.answer) },
        { dimension: "answer_faithfulness", promise: judgeAnswerFaithfulness(c.question, c.answer, c.context) },
      ];

      const settled = await runDimensionBatch(calls);
      for (const { dimension, result } of settled) {
        results.push({
          subject_type: "dataset_case",
          subject_id: subjectId,
          subject_label: label,
          dimension,
          score: result.score,
          reasoning: result.reasoning,
        });
      }
    } else if (c.type === "scout") {
      // For dataset scout cases: use the provided expected_decision as ground truth
      const { score, reasoning } = await judgeScoutRelevance(
        c.interest_profile,
        c.article_title,
        c.article_description,
        0, // no prior scout score — judge evaluates purely from ground truth
        c.expected_decision
      );
      results.push({
        subject_type: "dataset_case",
        subject_id: subjectId,
        subject_label: label,
        dimension: "scout_relevance",
        score,
        reasoning,
      });
    }
  }
}

// ── Scout live eval ───────────────────────────────────────────────────────────
// Uses the user's own save/dismiss decisions as ground truth.
// Samples actioned suggestions, re-judges whether the scout's original score
// matched what the user actually decided.

async function runScoutEval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sampleSize: number,
  results: ResultRow[]
) {
  // Get actioned suggestions (saved or dismissed) — these have ground truth
  const { data: suggestions } = await supabase
    .from("scout_suggestions")
    .select("id, title, description, relevance_score, relevance_reason, status, source_label")
    .eq("user_id", userId)
    .in("status", ["saved", "dismissed"])
    .order("created_at", { ascending: false })
    .limit(sampleSize);

  if (!suggestions || suggestions.length === 0) return;

  // Build interest profile from vault tags
  const { data: tagRows } = await supabase
    .from("tags")
    .select("name")
    .eq("user_id", userId)
    .order("name");

  const vaultTags = (tagRows || []).map((r) => r.name).filter(Boolean);
  const interestProfile = buildInterestProfile(vaultTags, "");

  const calls: { dimension: EvalDimension; promise: Promise<JudgeResult> }[] = suggestions.map(
    (s) => ({
      dimension: "scout_relevance" as EvalDimension,
      promise: judgeScoutRelevance(
        interestProfile,
        s.title as string,
        (s.description as string) ?? "",
        s.relevance_score as number,
        s.status as "saved" | "dismissed"
      ),
    })
  );

  const settled = await runDimensionBatch(calls);
  for (let i = 0; i < settled.length; i++) {
    const { result } = settled[i];
    const s = suggestions[i];
    const userDecision = s.status === "saved" ? "✓ saved" : "✗ dismissed";
    results.push({
      subject_type: "scout_suggestion",
      subject_id: s.id as string,
      subject_label: `[${userDecision}] ${s.title}`,
      dimension: "scout_relevance",
      score: result.score,
      reasoning: result.reasoning,
    });
  }
}
