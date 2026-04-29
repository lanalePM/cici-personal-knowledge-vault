import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeTagName } from "@/lib/tags/normalize-tag";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch tags
  const { data: itemTags } = await supabase
    .from("item_tags")
    .select("tag_id, is_ai, tags(id, name)")
    .eq("item_id", id);

  const tags = (itemTags || []).map((it: any) => ({
    ...it.tags,
    is_ai: it.is_ai,
  }));

  return NextResponse.json({ ...item, tags });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Add tag
  if (body.add_tag) {
    const canonical = normalizeTagName(String(body.add_tag));
    if (!canonical) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    // Get or create tag
    let { data: tag } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", canonical)
      .single();

    if (!tag) {
      const { data: newTag, error: tagError } = await supabase
        .from("tags")
        .insert({ user_id: user.id, name: canonical })
        .select()
        .single();
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 });
      tag = newTag;
    }

    await supabase
      .from("item_tags")
      .insert({ item_id: id, tag_id: tag!.id, is_ai: false });

    return NextResponse.json({ success: true });
  }

  // Remove tag
  if (body.remove_tag_id) {
    await supabase
      .from("item_tags")
      .delete()
      .eq("item_id", id)
      .eq("tag_id", body.remove_tag_id);

    return NextResponse.json({ success: true });
  }

  // Update note or other fields
  const updates: Record<string, any> = {};
  if (body.note !== undefined) updates.note = body.note;
  if (body.title !== undefined) updates.title = body.title;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get item to check for files
  const { data: item } = await supabase
    .from("items")
    .select("content_type, content_ref")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  // Delete from DB (cascades to item_tags and item_embeddings)
  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up storage files
  if (
    item &&
    (item.content_type === "pdf" || item.content_type === "image") &&
    item.content_ref
  ) {
    const dirPath = `${user.id}/${id}`;
    const { data: files } = await supabase.storage.from("vault-files").list(dirPath);
    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${dirPath}/${f.name}`);
      await supabase.storage.from("vault-files").remove(filePaths);
    }
  }

  return NextResponse.json({ success: true });
}
