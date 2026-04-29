import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// ── POST /api/folders/[id]/tags ───────────────────────────────────────────────
// Adds a tag name to the folder. Body: { tag_name: string }

export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as { tag_name?: string };
  const tagName = body.tag_name?.trim().toLowerCase();
  if (!tagName) return NextResponse.json({ error: "tag_name required" }, { status: 400 });

  // Verify folder belongs to user
  const { data: folder } = await supabase
    .from("vault_folders")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

  const { error } = await supabase
    .from("folder_tags")
    .upsert({ folder_id: id, tag_name: tagName }, { onConflict: "folder_id,tag_name" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── DELETE /api/folders/[id]/tags ─────────────────────────────────────────────
// Removes a tag from a folder. Body: { tag_name: string }

export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as { tag_name?: string };
  const tagName = body.tag_name?.trim().toLowerCase();
  if (!tagName) return NextResponse.json({ error: "tag_name required" }, { status: 400 });

  // Verify folder belongs to user
  const { data: folder } = await supabase
    .from("vault_folders")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

  const { error } = await supabase
    .from("folder_tags")
    .delete()
    .eq("folder_id", id)
    .eq("tag_name", tagName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
