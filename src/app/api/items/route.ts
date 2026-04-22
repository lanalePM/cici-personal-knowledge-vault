import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processItem } from "@/lib/ai/process-item";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get("content_type");
  const tag = searchParams.get("tag");
  const sort = searchParams.get("sort") || "newest";

  let query = supabase
    .from("items")
    .select("*")
    .eq("user_id", user.id);

  if (contentType && contentType !== "all") {
    if (contentType === "link") {
      query = query.in("content_type", ["link", "pasted_link"]);
    } else {
      query = query.eq("content_type", contentType);
    }
  }

  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch tags for each item
  const itemIds = (items || []).map((i) => i.id);
  let itemsWithTags = (items || []).map((i) => ({ ...i, tags: [] as any[] }));

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
      itemsWithTags = itemsWithTags.map((item) => ({
        ...item,
        tags: tagMap.get(item.id) || [],
      }));
    }
  }

  // Compute tag counts from ALL items (before tag filtering)
  const tagCounts: Record<string, number> = {};
  for (const it of itemsWithTags) {
    for (const t of it.tags) {
      tagCounts[t.name] = (tagCounts[t.name] || 0) + 1;
    }
  }

  const tagsWithCounts = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Filter by tag if specified (after computing counts)
  if (tag) {
    itemsWithTags = itemsWithTags.filter((item) =>
      item.tags.some((t: any) => t.name === tag)
    );
  }

  return NextResponse.json({ items: itemsWithTags, tags: tagsWithCounts });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentTypeHeader = request.headers.get("content-type") || "";

  // File upload
  if (contentTypeHeader.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const note = (formData.get("note") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 5 MB." },
        { status: 400 }
      );
    }

    const isPdf = file.type === "application/pdf";
    const fileContentType = isPdf ? "pdf" : "image";
    const itemId = crypto.randomUUID();
    const storagePath = `${user.id}/${itemId}/${file.name}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("vault-files")
      .upload(storagePath, file);

    if (uploadError) {
      return NextResponse.json(
        { error: "File upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("vault-files").getPublicUrl(storagePath);

    const { data: item, error: insertError } = await supabase
      .from("items")
      .insert({
        id: itemId,
        user_id: user.id,
        title: file.name,
        content_type: fileContentType,
        content_ref: publicUrl,
        note,
        status: "processing",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Fire-and-forget AI processing (don't await — return immediately)
    processItem(item.id).catch(console.error);

    return NextResponse.json(item, { status: 201 });
  }

  // JSON body (link / selected_text / pasted_link)
  const body = await request.json();
  const {
    source_url,
    content_type,
    content_ref,
    page_text,
    title,
    note,
    force,
  } = body;

  // Duplicate detection for URLs (skip if force=true, i.e. "Save anyway")
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
        { status: 200 }
      );
    }
  }

  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      source_url: source_url || null,
      title: title || source_url || "Untitled",
      content_type: content_type || "pasted_link",
      content_ref: content_ref || null,
      page_text: page_text || null,
      note: note || "",
      status: "processing",
      is_duplicate: !!force,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Fire-and-forget AI processing (don't await — return immediately)
  processItem(item.id).catch(console.error);

  return NextResponse.json(item, { status: 201 });
}
