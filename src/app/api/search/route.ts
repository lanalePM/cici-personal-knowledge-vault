import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai/gemini";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query?.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);

    // Call the hybrid_search database function
    const { data: results, error } = await supabase.rpc("hybrid_search", {
      query_text: query,
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 20,
      p_user_id: user.id,
    });

    if (error) {
      console.error("Hybrid search error:", error);
      // Fallback to keyword-only search
      return keywordFallback(supabase, user.id, query);
    }

    // Fetch tags for results
    const itemIds = (results || []).map((r: any) => r.id);
    let resultsWithTags = (results || []).map((r: any) => ({
      ...r,
      tags: [] as any[],
    }));

    if (itemIds.length > 0) {
      const { data: itemTags } = await supabase
        .from("item_tags")
        .select("item_id, tag_id, is_ai, tags(id, name)")
        .in("item_id", itemIds);

      if (itemTags) {
        const tagMap = new Map<string, any[]>();
        for (const it of itemTags) {
          const existing = tagMap.get(it.item_id) || [];
          existing.push({ ...(it as any).tags, is_ai: it.is_ai });
          tagMap.set(it.item_id, existing);
        }
        resultsWithTags = resultsWithTags.map((item: any) => ({
          ...item,
          tags: tagMap.get(item.id) || [],
        }));
      }
    }

    return NextResponse.json({ results: resultsWithTags });
  } catch (err) {
    console.error("Search error:", err);
    return keywordFallback(supabase, user.id, query);
  }
}

async function keywordFallback(
  supabase: any,
  userId: string,
  query: string
) {
  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .or(
      `title.ilike.%${query}%,summary.ilike.%${query}%,note.ilike.%${query}%`
    )
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    results: (items || []).map((i: any) => ({ ...i, tags: [] })),
  });
}
