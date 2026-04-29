import { extractTextFromPdf } from "@/lib/ai/content-extractor";
import type { Item } from "@/types/database";

/**
 * Best-effort full text for chunking. May be short if only summary exists.
 */
export async function getTextForChunking(item: Item): Promise<string> {
  switch (item.content_type) {
    case "selected_text":
    case "pasted_link": {
      if (item.content_ref?.trim()) return item.content_ref;
      return [item.title, item.summary, item.note].filter(Boolean).join("\n\n");
    }
    case "link": {
      if (item.page_text?.trim()) return item.page_text;
      return [item.title, item.summary, item.note].filter(Boolean).join("\n\n");
    }
    case "pdf": {
      if (item.content_ref) {
        const pdf = await extractTextFromPdf(item.content_ref);
        if (pdf?.trim()) return pdf;
      }
      return [item.title, item.summary, item.note].filter(Boolean).join("\n\n");
    }
    case "image":
    default:
      return [item.title, item.summary, item.note].filter(Boolean).join("\n\n");
  }
}
