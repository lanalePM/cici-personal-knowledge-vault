"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import { useToast } from "@/components/ui/Toast";
import type { ItemWithTags, Tag } from "@/types/database";
import { formatRelativeDate, getDomain } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  RotateCcw,
  Plus,
  X,
} from "lucide-react";

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [item, setItem] = useState<ItemWithTags | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [retrying, setRetrying] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${params.id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setItem(data);
      setNote(data.note || "");
    } catch {
      addToast({ type: "error", title: "Item not found", duration: 3000 });
      router.push("/vault");
    } finally {
      setLoading(false);
    }
  }, [params.id, router, addToast]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  // Poll while item is still processing
  useEffect(() => {
    if (item?.status !== "processing") return;
    const interval = setInterval(fetchItem, 4000);
    return () => clearInterval(interval);
  }, [item?.status, fetchItem]);

  function handleNoteChange(value: string) {
    setNote(value);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => saveNote(value), 1000);
  }

  async function saveNote(value: string) {
    await fetch(`/api/items/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: value }),
    });
  }

  function handleDelete() {
    const itemTitle = item?.title || "Untitled";
    const itemId = params.id as string;
    let undone = false;

    const deleteTimer = setTimeout(() => {
      if (!undone) {
        fetch(`/api/items/${itemId}`, { method: "DELETE" }).catch(console.error);
      }
    }, 6500);

    router.push("/vault");

    addToast({
      type: "delete",
      title: "Item deleted",
      subtitle: itemTitle,
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          clearTimeout(deleteTimer);
          router.push(`/vault/${itemId}`);
        },
      },
    });
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await fetch(`/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: params.id }),
      });
      await fetchItem();
    } catch {
      addToast({ type: "error", title: "Retry failed", duration: 3000 });
    } finally {
      setRetrying(false);
    }
  }

  async function handleAddTag() {
    if (!newTag.trim()) return;
    try {
      await fetch(`/api/items/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add_tag: newTag.trim() }),
      });
      setNewTag("");
      setAddingTag(false);
      await fetchItem();
    } catch {
      addToast({ type: "error", title: "Failed to add tag", duration: 3000 });
    }
  }

  async function handleRemoveTag(tagId: string) {
    try {
      await fetch(`/api/items/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove_tag_id: tagId }),
      });
      await fetchItem();
    } catch {
      addToast({ type: "error", title: "Failed to remove tag", duration: 3000 });
    }
  }

  function getSummaryProvenance(): string {
    if (!item) return "";
    switch (item.summary_source) {
      case "full_article":
        return "Summarized from full article";
      case "og_meta":
        return "Summarized from page metadata";
      case "page_preview":
        return "Summarized from page preview";
      case "selected_text": {
        const wordCount = item.content_ref?.split(/\s+/).length || 0;
        return `Summarized from selected text (${wordCount} words)`;
      }
      case "pdf_text":
        return "Summarized from PDF text";
      case "image":
        return "Described from image";
      default:
        return "AI summary";
    }
  }

  function getSourceLink(): { label: string; url: string } | null {
    if (!item) return null;
    if (item.source_url) {
      return { label: "View source", url: item.source_url };
    }
    if (
      item.content_ref &&
      (item.content_type === "pdf" || item.content_type === "image")
    ) {
      return { label: "Open file", url: item.content_ref };
    }
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <TopBar
          onMenuToggle={() => {}}
          onSearch={() => {}}
          searchQuery=""
        />
        <div className="flex">
          <Sidebar
            tags={[]}
            activeFilter="all"
            activeTag={null}
            onFilterChange={() => {}}
            onTagSelect={() => {}}
            isOpen={false}
            onClose={() => {}}
          />
          <main className="flex-1 p-8">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="h-8 w-48 bg-bg-secondary rounded animate-pulse" />
              <div className="h-6 w-96 bg-bg-secondary rounded animate-pulse" />
              <div className="h-32 bg-bg-secondary rounded animate-pulse" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const sourceLink = getSourceLink();

  return (
    <div className="min-h-screen bg-bg-primary">
      <TopBar
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSearch={(q) => {
          if (q) router.push(`/vault?search=${encodeURIComponent(q)}`);
        }}
        searchQuery=""
      />

      <div className="flex">
        <Sidebar
          tags={[]}
          activeFilter="all"
          activeTag={null}
          onFilterChange={() => router.push("/vault")}
          onTagSelect={() => {}}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => router.push("/vault")}
              className="flex items-center gap-1 text-sm text-accent hover:underline mb-6"
            >
              <ArrowLeft size={14} /> Back to library
            </button>

            <h1 className="text-[28px] font-bold leading-tight mb-2">
              {item.title || "Untitled"}
            </h1>

            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline mb-1"
              >
                {getDomain(item.source_url)}
                <ExternalLink size={12} />
              </a>
            )}

            {(item.content_type === "pdf" || item.content_type === "image") &&
              item.content_ref && (
                <a
                  href={item.content_ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent hover:underline mb-1"
                >
                  Open file <ExternalLink size={12} />
                </a>
              )}

            <p className="text-[13px] text-text-secondary mb-8">
              Saved {formatRelativeDate(item.created_at)}
            </p>

            {item.content_type === "selected_text" && item.content_ref && (
              <div className="border-l-[3px] border-accent bg-bg-secondary rounded-r-md p-4 mb-6">
                <p className="text-sm italic text-text-primary leading-relaxed">
                  &ldquo;{item.content_ref}&rdquo;
                </p>
              </div>
            )}

            {item.content_type === "image" && item.content_ref && (
              <div className="mb-6">
                <img
                  src={item.content_ref}
                  alt={item.title}
                  className="max-w-full max-h-[400px] rounded-lg border border-border object-contain"
                />
              </div>
            )}

            {/* AI Summary */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] uppercase tracking-wider text-text-tertiary font-medium">
                  AI Summary
                </span>
                <div className="flex-1 border-t border-border" />
              </div>

              {item.status === "processing" ? (
                <div className="space-y-2">
                  <div className="h-4 bg-bg-secondary rounded animate-pulse w-full" />
                  <div className="h-4 bg-bg-secondary rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-bg-secondary rounded animate-pulse w-4/6" />
                  <p className="text-xs text-text-tertiary mt-2">
                    Generating summary...
                  </p>
                </div>
              ) : item.status === "summary_failed" ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-tertiary">
                    Summary unavailable
                  </p>
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-accent text-accent rounded-md hover:bg-accent-light disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    {retrying ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed">{item.summary}</p>
                  <p className="text-xs text-text-tertiary mt-3">
                    {getSummaryProvenance()}
                    {sourceLink && (
                      <>
                        {" · "}
                        <a
                          href={sourceLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          {sourceLink.label} ↗
                        </a>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Tags */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] uppercase tracking-wider text-text-tertiary font-medium">
                  Tags
                </span>
                <div className="flex-1 border-t border-border" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {item.tags.map((tag: Tag & { is_ai: boolean }) => (
                  <span
                    key={tag.id}
                    className={`group inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full ${
                      tag.is_ai
                        ? "bg-tag-bg text-tag-text"
                        : "bg-bg-secondary text-text-primary"
                    }`}
                    title={
                      tag.is_ai ? "AI-suggested based on summary" : undefined
                    }
                  >
                    {tag.is_ai && <span className="text-[10px]">✦</span>}
                    #{tag.name}
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-error transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}

                {addingTag ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTag();
                        if (e.key === "Escape") setAddingTag(false);
                      }}
                      placeholder="tag name"
                      autoFocus
                      className="w-28 px-2 py-1 text-xs bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTag(true)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Plus size={12} /> Add tag
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] uppercase tracking-wider text-text-tertiary font-medium">
                  My Notes
                </span>
                <div className="flex-1 border-t border-border" />
              </div>

              <textarea
                value={note}
                onChange={(e) => handleNoteChange(e.target.value)}
                onBlur={() => saveNote(note)}
                placeholder="Add a note..."
                rows={4}
                className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
              />
            </div>

            {/* Delete */}
            <div className="flex justify-end pt-4 border-t border-border">
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 text-sm text-error hover:underline"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
