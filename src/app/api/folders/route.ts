import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── GET /api/folders ──────────────────────────────────────────────────────────
// Returns all folders for the authenticated user, each with its tag names.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: folders, error } = await supabase
    .from("vault_folders")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const folderIds = (folders || []).map((f) => f.id);

  const tagsByFolder = new Map<string, string[]>();
  if (folderIds.length > 0) {
    const { data: ft } = await supabase
      .from("folder_tags")
      .select("folder_id, tag_name")
      .in("folder_id", folderIds);

    for (const row of ft || []) {
      const arr = tagsByFolder.get(row.folder_id) || [];
      arr.push(row.tag_name);
      tagsByFolder.set(row.folder_id, arr);
    }
  }

  const result = (folders || []).map((f) => ({
    ...f,
    tags: tagsByFolder.get(f.id) || [],
  }));

  return NextResponse.json({ folders: result });
}

// ── POST /api/folders ─────────────────────────────────────────────────────────
// Creates a new folder. Body: { name: string }

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data: folder, error } = await supabase
    .from("vault_folders")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ folder: { ...folder, tags: [] } }, { status: 201 });
}
