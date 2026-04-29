import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedArticles,
  scoreArticleRelevance,
  buildInterestProfile,
} from "@/lib/ai/scout";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const manualInterests: string = body.manual_interests ?? "";

  // ── 1. Build interest profile from vault tags ──────────────────────────────
  const { data: tagRows } = await supabase
    .from("item_tags")
    .select("tags(name)")
    .eq("items.user_id", user.id)
    .limit(200);

  // Count tag frequency from items directly
  const { data: userTagRows } = await supabase
    .from("tags")
    .select("name")
    .eq("user_id", user.id)
    .order("name");

  const vaultTags = (userTagRows || []).map((r) => r.name).filter(Boolean);
  const interestProfile = buildInterestProfile(vaultTags, manualInterests);

  // ── 2. Load active sources ─────────────────────────────────────────────────
  const { data: sources } = await supabase
    .from("scout_sources")
    .select("id, label, feed_url")
    .eq("user_id", user.id)
    .eq("active", true);

  if (!sources || sources.length === 0) {
    return NextResponse.json({ error: "No active sources. Add at least one RSS feed first." }, { status: 400 });
  }

  // ── 3. Load already-seen URLs to avoid duplicates ─────────────────────────
  const { data: existingSuggestions } = await supabase
    .from("scout_suggestions")
    .select("url")
    .eq("user_id", user.id);

  const { data: vaultItems } = await supabase
    .from("items")
    .select("source_url")
    .eq("user_id", user.id)
    .not("source_url", "is", null);

  const seenUrls = new Set<string>([
    ...(existingSuggestions || []).map((r) => r.url),
    ...(vaultItems || []).map((r) => r.source_url as string),
  ]);

  // ── 4. Fetch + score articles from each feed ───────────────────────────────
  const newSuggestions: {
    user_id: string;
    source_id: string;
    source_label: string;
    title: string;
    url: string;
    description: string | null;
    published_at: string | null;
    relevance_score: number;
    relevance_reason: string;
  }[] = [];

  for (const source of sources) {
    let articles;
    try {
      articles = await fetchFeedArticles(source.feed_url);
    } catch (e) {
      console.warn(`[scout] Failed to fetch ${source.feed_url}:`, e);
      continue;
    }

    // Filter already-seen
    const fresh = articles.filter((a) => a.url && !seenUrls.has(a.url));

    // Score each article (cap at 10 per source to keep runtime reasonable)
    for (const article of fresh.slice(0, 10)) {
      try {
        const { score, reason } = await scoreArticleRelevance(article, interestProfile);
        if (score >= 3) {
          newSuggestions.push({
            user_id: user.id,
            source_id: source.id,
            source_label: source.label,
            title: article.title,
            url: article.url,
            description: article.description || null,
            published_at: article.publishedAt,
            relevance_score: score,
            relevance_reason: reason,
          });
          seenUrls.add(article.url); // prevent cross-source duplicates
        }
      } catch (e) {
        console.warn(`[scout] Scoring failed for "${article.title}":`, e);
      }
    }
  }

  // ── 5. Persist ─────────────────────────────────────────────────────────────
  if (newSuggestions.length > 0) {
    await supabase.from("scout_suggestions").insert(newSuggestions);
  }

  return NextResponse.json({
    found: newSuggestions.length,
    sources_checked: sources.length,
    interest_profile: interestProfile,
  });
}
