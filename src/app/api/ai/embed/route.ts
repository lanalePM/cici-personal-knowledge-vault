import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/ai/gemini";

export async function POST(request: NextRequest) {
  const { item_id } = await request.json();
  if (!item_id) {
    return NextResponse.json({ error: "item_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: item, error } = await supabase
    .from("items")
    .select("title, summary, note")
    .eq("id", item_id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const embeddingText = [item.title, item.summary, item.note]
    .filter(Boolean)
    .join("\n\n");

  if (!embeddingText.trim()) {
    return NextResponse.json({ error: "No content to embed" }, { status: 400 });
  }

  try {
    const embedding = await generateEmbedding(embeddingText);

    await supabase.from("item_embeddings").upsert(
      {
        item_id,
        embedding: JSON.stringify(embedding),
      },
      { onConflict: "item_id" }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Embedding failed:", err);
    return NextResponse.json(
      { error: "Embedding generation failed" },
      { status: 500 }
    );
  }
}
