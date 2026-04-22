import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { processItem } from "@/lib/ai/process-item";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  return user ? { user, supabase } : null;
}

export async function POST(request: NextRequest) {
  const auth = await getUserFromToken(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders() }
    );
  }

  const { user, supabase } = auth;
  const body = await request.json();
  const { source_url, content_type, content_ref, page_text, title, note, force } = body;

  if (!source_url && !content_ref) {
    return NextResponse.json(
      { error: "source_url or content_ref is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  // Duplicate detection for URLs
  if (source_url && !force) {
    const { data: existing } = await supabase
      .from("items")
      .select("id")
      .eq("user_id", user.id)
      .eq("source_url", source_url)
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { duplicate: true, existing_id: existing.id },
        { status: 200, headers: corsHeaders() }
      );
    }
  }

  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      source_url: source_url || null,
      title: title || source_url || "Untitled",
      content_type: content_type || "link",
      content_ref: content_ref || null,
      page_text: page_text || null,
      note: note || "",
      status: "processing",
      is_duplicate: !!force,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500, headers: corsHeaders() }
    );
  }

  processItem(item.id).catch(console.error);

  // Get vault count for the extension flyout
  const { count } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json(
    { ...item, vault_count: count || 0 },
    { status: 201, headers: corsHeaders() }
  );
}
