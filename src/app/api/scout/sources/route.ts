import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sources } = await supabase
    .from("scout_sources")
    .select("id, label, feed_url, active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ sources: sources || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { label, feed_url } = body as { label?: string; feed_url?: string };

  if (!label?.trim() || !feed_url?.trim()) {
    return NextResponse.json({ error: "label and feed_url are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("scout_sources")
    .insert({ user_id: user.id, label: label.trim(), feed_url: feed_url.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
