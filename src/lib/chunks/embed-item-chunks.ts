import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "@/lib/ai/gemini";
import { splitTextIntoChunks } from "@/lib/chunks/split-text";
import { getTextForChunking } from "@/lib/chunks/extract-item-text";
import type { Item } from "@/types/database";

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Replace all chunks for an item with freshly embedded slices.
 * Safe to call multiple times (idempotent per item).
 */
export async function chunkAndEmbedForItem(itemId: string): Promise<{
  ok: boolean;
  chunkCount?: number;
  skipped?: boolean;
  error?: string;
}> {
  const supabase = serviceSupabase();

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) {
    return { ok: false, error: "item_not_found" };
  }

  const row = item as Item;
  if (row.status !== "ready") {
    return { ok: true, skipped: true };
  }

  let raw: string;
  try {
    raw = await getTextForChunking(row);
  } catch {
    raw = [row.title, row.summary, row.note].filter(Boolean).join("\n\n");
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 40) {
    return { ok: true, skipped: true };
  }

  const pieces = splitTextIntoChunks(trimmed);
  if (pieces.length === 0) {
    return { ok: true, skipped: true };
  }

  await supabase.from("item_chunks").delete().eq("item_id", itemId);

  for (let i = 0; i < pieces.length; i++) {
    const embedding = await generateEmbedding(pieces[i]);
    const { error: insErr } = await supabase.from("item_chunks").insert({
      user_id: row.user_id,
      item_id: row.id,
      chunk_index: i,
      content: pieces[i],
      embedding: JSON.stringify(embedding),
    });
    if (insErr) {
      console.error("[chunks] insert failed", itemId, insErr);
      return { ok: false, error: insErr.message };
    }
  }

  console.log(`[chunks] ${pieces.length} chunks stored for item ${itemId}`);
  return { ok: true, chunkCount: pieces.length };
}
