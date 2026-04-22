"use client";

import Link from "next/link";
import { Link2, Type, FileText, FileImage } from "lucide-react";
import type { ItemWithTags } from "@/types/database";
import { formatRelativeDate } from "@/lib/utils";

interface ItemCardProps {
  item: ItemWithTags;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  link: <Link2 size={20} className="text-text-secondary" />,
  pasted_link: <Link2 size={20} className="text-text-secondary" />,
  selected_text: <Type size={20} className="text-text-secondary" />,
  pdf: <FileText size={20} className="text-text-secondary" />,
  image: <FileImage size={20} className="text-text-secondary" />,
};

function getSourceLabel(item: ItemWithTags): string {
  if (item.content_type === "selected_text") {
    return `Selected text · ${formatRelativeDate(item.created_at)}`;
  }
  if (item.content_type === "pdf") {
    return `PDF · ${formatRelativeDate(item.created_at)}`;
  }
  if (item.content_type === "image") {
    return `Image · ${formatRelativeDate(item.created_at)}`;
  }
  const domain = item.source_url
    ? new URL(item.source_url).hostname.replace("www.", "")
    : "";
  return `${domain} · ${formatRelativeDate(item.created_at)}`;
}

export default function ItemCard({ item }: ItemCardProps) {
  return (
    <Link href={`/vault/${item.id}`}>
      <div className="flex gap-4 p-4 border-b border-border hover:bg-bg-hover transition-colors cursor-pointer">
        <div className="w-12 h-12 rounded-md bg-bg-secondary flex items-center justify-center shrink-0">
          {TYPE_ICONS[item.content_type] || <Link2 size={20} />}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium truncate">
            {item.title || "Untitled"}
          </h3>
          <p className="text-[13px] text-text-secondary mt-0.5">
            {getSourceLabel(item)}
          </p>

          {item.status === "processing" ? (
            <div className="mt-2 h-4 w-3/4 bg-bg-secondary rounded animate-pulse" />
          ) : item.summary ? (
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">
              {item.summary}
            </p>
          ) : null}

          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-tag-bg text-tag-text"
                >
                  {tag.is_ai && (
                    <span className="text-[10px]">✦</span>
                  )}
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
