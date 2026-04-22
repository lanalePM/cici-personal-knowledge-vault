export type ContentType = "link" | "selected_text" | "pasted_link" | "pdf" | "image";
export type ItemStatus = "processing" | "ready" | "summary_failed";

export interface Item {
  id: string;
  user_id: string;
  source_url: string | null;
  title: string;
  content_type: ContentType;
  content_ref: string | null;
  page_text: string | null;
  summary: string | null;
  note: string;
  status: ItemStatus;
  is_duplicate: boolean;
  summary_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface ItemTag {
  item_id: string;
  tag_id: string;
  is_ai: boolean;
}

export interface ItemWithTags extends Item {
  tags: (Tag & { is_ai: boolean })[];
}

export interface SearchResult extends Item {
  rrf_score: number;
  tags?: (Tag & { is_ai: boolean })[];
}
