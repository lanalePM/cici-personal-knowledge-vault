import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("eval_runs")
    .select("id, mode, status, item_count, avg_scores, error, created_at, completed_at")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const { data: results } = await supabase
    .from("eval_results")
    .select("id, subject_type, subject_id, subject_label, dimension, score, reasoning, created_at")
    .eq("run_id", runId)
    .order("subject_id", { ascending: true })
    .order("dimension", { ascending: true });

  return NextResponse.json({ run, results: results || [] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("eval_runs")
    .delete()
    .eq("id", runId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
