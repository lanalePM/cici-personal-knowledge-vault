import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = new URL(request.url).searchParams.get("status") || "pending";

  const { data: suggestions } = await supabase
    .from("scout_suggestions")
    .select("id, source_label, title, url, description, published_at, relevance_score, relevance_reason, status, created_at")
    .eq("user_id", user.id)
    .eq("status", status)
    .order("relevance_score", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ suggestions: suggestions || [] });
}
