import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: corsHeaders() }
    );
  }

  const { count } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", session.user.id);

  return NextResponse.json({
    token: session.access_token,
    email: session.user.email,
    vault_count: count || 0,
  }, { headers: corsHeaders() });
}
