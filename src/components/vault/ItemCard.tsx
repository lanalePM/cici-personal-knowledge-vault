"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Type, FileText, FileImage, PenLine } from "lucide-react";
import type { ItemWithTags } from "@/types/database";
import { formatRelativeDate } from "@/lib/utils";

interface ItemCardProps {
  item: ItemWithTags;
}

// ── Icon & color palette per content type ─────────────────────────────────────

const TYPE_ICON: Record<string, React.ReactNode> = {
  link: <Link2 size={18} />,
  pasted_link: <Link2 size={18} />,
  selected_text: <Type size={18} />,
  pdf: <FileText size={18} />,
  image: <FileImage size={18} />,
};

// Opacity-based colors so they adapt to both light and dark mode
const TYPE_COLOR: Record<string, string> = {
  link: "bg-accent/10 text-accent",
  pasted_link: "bg-accent/10 text-accent",
  selected_text: "bg-violet-500/10 text-violet-500",
  pdf: "bg-orange-500/10 text-orange-500",
  image: "bg-emerald-500/10 text-emerald-500",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSourceLabel(item: ItemWithTags): string {
  if (item.content_type === "selected_text")
    return `Selected text · ${formatRelativeDate(item.created_at)}`;
  if (item.content_type === "pdf")
    return `PDF · ${formatRelativeDate(item.created_at)}`;
  if (item.content_type === "image")
    return `Image · ${formatRelativeDate(item.created_at)}`;
  const domain = item.source_url
    ? new URL(item.source_url).hostname.replace("www.", "")
    : "";
  return `${domain} · ${formatRelativeDate(item.created_at)}`;
}

function getFaviconUrl(item: ItemWithTags): string | null {
  if (!item.source_url) return null;
  if (!["link", "pasted_link"].includes(item.content_type)) return null;
  try {
    const { hostname } = new URL(item.source_url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ItemCard({ item }: ItemCardProps) {
  const router = useRouter();
  const [faviconError, setFaviconError] = useState(false);

  const faviconUrl = getFaviconUrl(item);
  const colorCls = TYPE_COLOR[item.content_type] ?? "bg-bg-secondary text-text-secondary";
  const hasNote = !!item.note;

  return (
    <Link href={`/vault/${item.id}`}>
      <div className="flex gap-4 p-4 border-b border-border hover:bg-bg-hover transition-colors cursor-pointer">

        {/* Icon / Favicon */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorCls}`}>
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              alt=""
              width={20}
              height={20}
              className="rounded-sm"
              onError={() => setFaviconError(true)}
            />
          ) : (
            TYPE_ICON[item.content_type] ?? <Link2 size={18} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-[15px] font-medium truncate">
              {item.title || "Untitled"}
            </h3>
            {hasNote && (
              <PenLine
                size={12}
                className="text-text-tertiary shrink-0 opacity-60"
                aria-label="Has personal notes"
              />
            )}
          </div>

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

          {/* Tags — each is a button that filters by that tag */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/vault?tag=${encodeURIComponent(tag.name)}`);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-tag-bg text-tag-text hover:ring-1 hover:ring-accent/40 transition-all"
                >
                  {tag.is_ai && <span className="text-[10px]">✦</span>}
                  #{tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
