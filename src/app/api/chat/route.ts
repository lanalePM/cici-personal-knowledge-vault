import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateAskCiciAnswer,
  generateEmbedding,
  type AskCiciContextBlock,
} from "@/lib/ai/gemini";
import { getTextForChunking } from "@/lib/chunks/extract-item-text";
import type { Item } from "@/types/database";

export const maxDuration = 120;

type Scope = "synthesis" | "topic" | "item";

// ── GET ─────────────────────────────────────────────────────────────────────
// No params  → list all threads for the user
// ?thread_id → messages + sources for that thread

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = request.nextUrl.searchParams.get("thread_id");

  // ── List threads ──────────────────────────────────────────────────────────
  if (!threadId) {
    const { data: threads } = await supabase
      .from("chat_threads")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ threads: threads || [] });
  }

  // ── Messages for a thread ─────────────────────────────────────────────────
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread?.id) {
    return NextResponse.json({ messages: [] });
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true })
    .limit(80);

  const rows = messages || [];
  const assistantIds = rows.filter((m) => m.role === "assistant").map((m) => m.id);

  const sourcesByMessage = new Map<
    string,
    { item_id: string; title: string; href: string; source_url: string | null }[]
  >();

  if (assistantIds.length > 0) {
    const { data: srcRows } = await supabase
      .from("chat_message_sources")
      .select("message_id, item_id, rank")
      .in("message_id", assistantIds);

    const sorted = [...(srcRows || [])].sort((a, b) => {
      if (a.message_id !== b.message_id)
        return String(a.message_id).localeCompare(String(b.message_id));
      return (a.rank ?? 0) - (b.rank ?? 0);
    });

    const itemIds = [...new Set(sorted.map((r) => r.item_id))];
    const { data: items } =
      itemIds.length > 0
        ? await supabase
            .from("items")
            .select("id, title, source_url")
            .eq("user_id", user.id)
            .in("id", itemIds)
        : { data: [] as { id: string; title: string | null; source_url: string | null }[] };

    const titleById = new Map(
      (items || []).map((it) => [it.id, it.title?.trim() || "Untitled"])
    );
    const sourceUrlById = new Map((items || []).map((it) => [it.id, it.source_url]));

    for (const r of sorted) {
      const list = sourcesByMessage.get(r.message_id) || [];
      if (list.some((s) => s.item_id === r.item_id)) continue;
      list.push({
        item_id: r.item_id,
        title: titleById.get(r.item_id) || "Untitled",
        href: `/vault/${r.item_id}`,
        source_url: sourceUrlById.get(r.item_id) ?? null,
      });
      sourcesByMessage.set(r.message_id, list);
    }
  }

  const enriched = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    ...(m.role === "assistant" && sourcesByMessage.has(m.id)
      ? { sources: sourcesByMessage.get(m.id)! }
      : {}),
  }));

  return NextResponse.json({ messages: enriched });
}

// ── POST ─────────────────────────────────────────────────────────────────────
// body.thread_id present → continue that thread
// body.thread_id absent  → create a new thread (title = first 70 chars of message)

export async function POST(request: NextRequest) {
  const started = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    scope?: Scope;
    message?: string;
    item_id?: string;
    limit?: number;
    thread_id?: string;
    deep_dive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scope = body.scope || "topic";
  if (!["synthesis", "topic", "item"].includes(scope)) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  if (message.length > 8000) return NextResponse.json({ error: "message too long" }, { status: 400 });

  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 20);
  const deepDive = Boolean(body.deep_dive) && scope === "item";

  // ── Resolve thread ────────────────────────────────────────────────────────
  let threadId: string;

  if (body.thread_id) {
    const { data: t } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", body.thread_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!t?.id) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    threadId = t.id;
  } else {
    const title =
      message.length > 70 ? `${message.slice(0, 70)}…` : message;

    const { data: newThread, error: tErr } = await supabase
      .from("chat_threads")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();

    if (tErr || !newThread) {
      return NextResponse.json({ error: "Could not open chat thread" }, { status: 500 });
    }
    threadId = newThread.id;
  }

  // ── Chat history for context ──────────────────────────────────────────────
  const { data: priorRows } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(12);

  const prior = (priorRows || [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ── Persist user message ──────────────────────────────────────────────────
  const { error: userInsErr } = await supabase
    .from("chat_messages")
    .insert({ thread_id: threadId, role: "user", content: message });

  if (userInsErr) {
    return NextResponse.json({ error: userInsErr.message }, { status: 500 });
  }

  // ── Retrieve context blocks ───────────────────────────────────────────────
  const blocks: AskCiciContextBlock[] = [];
  let retrievalCount = 0;

  function bundleId(itemId: string) {
    return `bundle-${itemId}`;
  }

  try {
    if (scope === "synthesis") {
      const { data: items, error } = await supabase
        .from("items")
        .select("id, title, summary, note")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      for (const it of items || []) {
        const bodyText = [it.title, it.summary, it.note]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4000);
        if (!bodyText.trim()) continue;
        blocks.push({
          kind: "item",
          id: bundleId(it.id),
          item_id: it.id,
          title: it.title || "Untitled",
          body: bodyText,
        });
      }
      retrievalCount = blocks.length;
    }

    if (scope === "topic") {
      const qEmb = await generateEmbedding(message);
      const { data: chunkHits, error: rpcErr } = await supabase.rpc(
        "search_item_chunks",
        { query_embedding: JSON.stringify(qEmb), match_count: 16, filter_item_id: null }
      );

      if (rpcErr) console.error("search_item_chunks:", rpcErr);

      for (const row of chunkHits || []) {
        blocks.push({
          kind: "chunk",
          id: row.chunk_id as string,
          item_id: row.item_id as string,
          title: (row.title as string) || "Untitled",
          chunk_index: row.chunk_index as number,
          body: String(row.content || "").slice(0, 6000),
        });
      }
      retrievalCount = blocks.length;

      if (blocks.length === 0) {
        const { data: loose } = await supabase
          .from("items")
          .select("id, title, summary, note")
          .eq("user_id", user.id)
          .or(
            `title.ilike.%${message}%,summary.ilike.%${message}%,note.ilike.%${message}%`
          )
          .limit(8);

        for (const it of loose || []) {
          const bodyText = [it.title, it.summary, it.note]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 3500);
          if (!bodyText.trim()) continue;
          blocks.push({
            kind: "item",
            id: bundleId(it.id),
            item_id: it.id,
            title: it.title || "Untitled",
            body: bodyText,
          });
        }
        retrievalCount = blocks.length;
      }
    }

    if (scope === "item") {
      const itemId = body.item_id?.trim();
      if (!itemId) {
        return NextResponse.json({ error: "item_id required for scope=item" }, { status: 400 });
      }

      const { data: owned, error: ownErr } = await supabase
        .from("items")
        .select("*")
        .eq("id", itemId)
        .eq("user_id", user.id)
        .single();

      if (ownErr || !owned) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      if (deepDive) {
        // ── Deep Dive: skip RAG, load the full article text as a single block ──
        const fullText = await getTextForChunking(owned as Item);
        // Gemini 2.5 Flash supports large context; cap at 80k chars to stay safe
        const bodyText = fullText.trim().slice(0, 80000);
        if (bodyText.length > 0) {
          blocks.push({
            kind: "item",
            id: bundleId(owned.id),
            item_id: owned.id,
            title: (owned.title as string) || "Untitled",
            body: bodyText,
          });
        }
      } else {
        // ── RAG mode (default) ───────────────────────────────────────────────
        const qEmb = await generateEmbedding(message);
        const { data: chunkHits, error: rpcErr } = await supabase.rpc(
          "search_item_chunks",
          {
            query_embedding: JSON.stringify(qEmb),
            match_count: 24,
            filter_item_id: itemId,
          }
        );

        if (rpcErr) console.error("search_item_chunks item scope:", rpcErr);

        for (const row of chunkHits || []) {
          blocks.push({
            kind: "chunk",
            id: row.chunk_id as string,
            item_id: row.item_id as string,
            title: (row.title as string) || "Untitled",
            chunk_index: row.chunk_index as number,
            body: String(row.content || "").slice(0, 6000),
          });
        }

        if (blocks.length === 0) {
          const fullText = await getTextForChunking(owned as Item);
          const bodyText = fullText.trim().slice(0, 14000);
          if (bodyText.length > 0) {
            blocks.push({
              kind: "item",
              id: bundleId(owned.id),
              item_id: owned.id,
              title: (owned.title as string) || "Untitled",
              body: bodyText,
            });
          }
        }
      }
      retrievalCount = blocks.length;
    }
  } catch (e) {
    console.error("Ask Cici retrieval error:", e);
    return NextResponse.json(
      { error: "Could not gather context from your vault." },
      { status: 500 }
    );
  }

  // ── Generate answer ───────────────────────────────────────────────────────
  const allowedIds = new Set(blocks.map((b) => b.id));
  const { answer, cited_ids } = await generateAskCiciAnswer({
    scope,
    userMessage: message,
    blocks,
    history: prior,
    deepDive,
  });
  const filteredCites = cited_ids.filter((id) => allowedIds.has(id));

  const { data: assistantRow, error: asstErr } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      role: "assistant",
      content: answer,
      meta: { scope, deep_dive: deepDive, retrieval_count: retrievalCount, cited_ids: filteredCites },
    })
    .select("id")
    .single();

  if (asstErr || !assistantRow) {
    return NextResponse.json({ error: asstErr?.message }, { status: 500 });
  }

  // ── Persist sources ───────────────────────────────────────────────────────
  const sources: {
    item_id: string;
    title: string;
    chunk_id: string | null;
    href: string;
    source_url: string | null;
  }[] = [];

  const sourceRows: {
    message_id: string;
    item_id: string;
    chunk_id: string | null;
    rank: number;
  }[] = [];

  let rank = 0;
  const seenItem = new Set<string>();
  for (const cite of filteredCites) {
    const block = blocks.find((b) => b.id === cite);
    if (!block) continue;
    const chunkId = block.kind === "chunk" ? block.id : null;
    sourceRows.push({ message_id: assistantRow.id, item_id: block.item_id, chunk_id: chunkId, rank: rank++ });
    if (!seenItem.has(block.item_id)) {
      seenItem.add(block.item_id);
      sources.push({ item_id: block.item_id, title: block.title, chunk_id: chunkId, href: `/vault/${block.item_id}`, source_url: null });
    }
  }

  const vaultSourceIds = sources.map((s) => s.item_id);
  let sourceUrlByItem = new Map<string, string | null>();
  if (vaultSourceIds.length > 0) {
    const { data: itemMeta } = await supabase
      .from("items")
      .select("id, source_url")
      .eq("user_id", user.id)
      .in("id", vaultSourceIds);
    sourceUrlByItem = new Map((itemMeta || []).map((row) => [row.id, row.source_url]));
  }

  const sourcesWithUrls = sources.map((s) => ({
    ...s,
    source_url: sourceUrlByItem.get(s.item_id) ?? null,
  }));

  if (sourceRows.length > 0) {
    await supabase.from("chat_message_sources").insert(sourceRows);
  }

  return NextResponse.json({
    thread_id: threadId,
    assistant_message_id: assistantRow.id,
    answer,
    sources: sourcesWithUrls,
    meta: {
      scope,
      retrieval_count: retrievalCount,
      model: "gemini-2.5-flash",
      latency_ms: Date.now() - started,
      cited_ids: filteredCites,
    },
  });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// ?thread_id → delete thread and all its messages (cascade)

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threadId = request.nextUrl.searchParams.get("thread_id");
  if (!threadId) return NextResponse.json({ error: "thread_id required" }, { status: 400 });

  const { error } = await supabase
    .from("chat_threads")
    .delete()
    .eq("id", threadId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
