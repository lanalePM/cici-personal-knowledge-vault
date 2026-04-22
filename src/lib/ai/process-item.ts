import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateSummaryAndTags, generateEmbedding } from "@/lib/ai/gemini";
import {
  extractContentFromUrl,
  extractTextFromPdf,
} from "@/lib/ai/content-extractor";

function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function processItem(itemId: string) {
  const supabase = getServiceClient();

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) {
    console.error("processItem: item not found", itemId, error);
    return;
  }

  try {
    let textForSummary = "";
    let summarySource = "";
    let isImage = false;
    let updatedTitle = item.title;

    switch (item.content_type) {
      case "link":
      case "pasted_link": {
        const extracted = await extractContentFromUrl(item.source_url);
        if (extracted) {
          textForSummary = extracted.content;
          summarySource = extracted.source;
          if (extracted.title && (!item.title || item.title === item.source_url)) {
            updatedTitle = extracted.title;
          }
        } else if (item.page_text) {
          textForSummary = item.page_text;
          summarySource = "page_preview";
        } else {
          throw new Error("Could not extract content from URL");
        }
        break;
      }

      case "selected_text": {
        textForSummary = item.content_ref || "";
        summarySource = "selected_text";
        if (!item.title || item.title === "Untitled") {
          updatedTitle =
            textForSummary.slice(0, 60) +
            (textForSummary.length > 60 ? "..." : "");
        }
        break;
      }

      case "pdf": {
        const pdfText = await extractTextFromPdf(item.content_ref);
        if (pdfText) {
          textForSummary = pdfText;
          summarySource = "pdf_text";
        } else {
          isImage = true;
          summarySource = "image";
        }
        break;
      }

      case "image": {
        isImage = true;
        summarySource = "image";
        break;
      }
    }

    console.log(`[AI] Generating summary for item ${itemId} (${item.content_type}, source: ${summarySource})`);

    const { summary, tags } = await generateSummaryAndTags(
      textForSummary,
      isImage ? "image" : "text",
      isImage ? item.content_ref : undefined
    );

    const limitedTags = tags.slice(0, 3);
    console.log(`[AI] Summary generated. Tags: ${limitedTags.join(", ")}`);

    await supabase
      .from("items")
      .update({
        summary,
        summary_source: summarySource,
        status: "ready",
        title: updatedTitle,
      })
      .eq("id", itemId);

    for (const tagName of limitedTags) {
      const normalizedTag = tagName.toLowerCase().trim();
      if (!normalizedTag) continue;

      let { data: tag } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", item.user_id)
        .eq("name", normalizedTag)
        .single();

      if (!tag) {
        const { data: newTag } = await supabase
          .from("tags")
          .insert({ user_id: item.user_id, name: normalizedTag })
          .select()
          .single();
        tag = newTag;
      }

      if (tag) {
        await supabase
          .from("item_tags")
          .upsert(
            { item_id: itemId, tag_id: tag.id, is_ai: true },
            { onConflict: "item_id,tag_id" }
          );
      }
    }

    // Generate embedding (non-fatal if it fails)
    try {
      const embeddingText = [updatedTitle, summary, item.note]
        .filter(Boolean)
        .join("\n\n");

      if (embeddingText.trim()) {
        console.log(`[AI] Generating embedding for item ${itemId}`);
        const embedding = await generateEmbedding(embeddingText);

        await supabase.from("item_embeddings").upsert(
          {
            item_id: itemId,
            embedding: JSON.stringify(embedding),
          },
          { onConflict: "item_id" }
        );
        console.log(`[AI] Embedding stored for item ${itemId}`);
      }
    } catch (embErr) {
      console.error(`[AI] Embedding failed (non-fatal):`, embErr);
    }

    console.log(`[AI] Item ${itemId} processing complete`);
  } catch (err) {
    console.error(`[AI] Processing failed for item ${itemId}:`, err);

    await supabase
      .from("items")
      .update({ status: "summary_failed" })
      .eq("id", itemId);
  }
}
