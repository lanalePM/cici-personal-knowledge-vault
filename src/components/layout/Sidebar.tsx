"use client";

import { useState, useRef, useEffect } from "react";
import {
  Library, Link2, FileText, FileImage, Type, Tag,
  Folder, FolderOpen, Plus, Trash2, Pencil, ChevronRight,
  ChevronDown, X, Sparkles, Loader2, Check,
} from "lucide-react";
import type { ContentType } from "@/types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterType = "all" | ContentType;

export type FolderWithTags = {
  id: string;
  name: string;
  tags: string[];
  created_at: string;
};

interface SidebarProps {
  tags: { name: string; count: number }[];
  activeFilter: FilterType;
  activeTag: string | null;
  onFilterChange: (filter: FilterType) => void;
  onTagSelect: (tag: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
  // Folder props (optional for backward-compat)
  folders?: FolderWithTags[];
  activeFolder?: string | null;
  onFolderSelect?: (folderId: string | null) => void;
  onFoldersChange?: () => void;
}

// ── Type filter list ──────────────────────────────────────────────────────────

const TYPE_FILTERS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "all",           label: "All",    icon: <Library   size={15} /> },
  { key: "link",          label: "Links",  icon: <Link2     size={15} /> },
  { key: "selected_text", label: "Text",   icon: <Type      size={15} /> },
  { key: "pdf",           label: "PDFs",   icon: <FileText  size={15} /> },
  { key: "image",         label: "Images", icon: <FileImage size={15} /> },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar({
  tags,
  activeFilter,
  activeTag,
  onFilterChange,
  onTagSelect,
  isOpen,
  onClose,
  folders = [],
  activeFolder = null,
  onFolderSelect,
  onFoldersChange,
}: SidebarProps) {
  // ── Folder UI state ────────────────────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingTagTo, setAddingTagTo] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestResult, setSuggestResult] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Tags already inside any folder
  const groupedTagNames = new Set(folders.flatMap((f) => f.tags));
  const ungroupedTags = tags.filter((t) => !groupedTagNames.has(t.name));

  // Autocomplete: tags matching the current input, not yet in the target folder
  function getMatchingTags(folderId: string) {
    const folder = folders.find((f) => f.id === folderId);
    const inFolder = new Set(folder?.tags ?? []);
    return tags
      .filter(
        (t) =>
          !inFolder.has(t.name) &&
          (tagInput.length === 0 || t.name.includes(tagInput.toLowerCase()))
      )
      .slice(0, 5);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Focus helpers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (renamingId) setTimeout(() => renameRef.current?.focus(), 50);
  }, [renamingId]);

  useEffect(() => {
    if (creatingFolder) setTimeout(() => newFolderRef.current?.focus(), 50);
  }, [creatingFolder]);

  useEffect(() => {
    if (addingTagTo) setTimeout(() => tagInputRef.current?.focus(), 50);
  }, [addingTagTo]);

  // ── API helpers ────────────────────────────────────────────────────────────

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewFolderName("");
    setCreatingFolder(false);
    onFoldersChange?.();
  }

  async function renameFolder(id: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setRenamingId(null);
    onFoldersChange?.();
  }

  async function deleteFolder(id: string) {
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (activeFolder === id) onFolderSelect?.(null);
    onFoldersChange?.();
  }

  async function addTagToFolder(folderId: string, tagName: string) {
    const name = tagName.trim().toLowerCase();
    if (!name) return;
    await fetch(`/api/folders/${folderId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: name }),
    });
    setTagInput("");
    setAddingTagTo(null);
    onFoldersChange?.();
  }

  async function removeTagFromFolder(folderId: string, tagName: string) {
    await fetch(`/api/folders/${folderId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: tagName }),
    });
    onFoldersChange?.();
  }

  async function suggestFolders() {
    setSuggesting(true);
    setSuggestResult(null);
    try {
      const res = await fetch("/api/folders/suggest", { method: "POST" });
      const data = await res.json() as { folders_created?: number; error?: string };
      if (!res.ok) {
        setSuggestResult(data.error ?? "Suggestion failed");
      } else {
        setSuggestResult(`${data.folders_created} folder${data.folders_created !== 1 ? "s" : ""} created`);
        onFoldersChange?.();
      }
    } catch {
      setSuggestResult("Request failed");
    } finally {
      setSuggesting(false);
      setTimeout(() => setSuggestResult(null), 4000);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed lg:static top-14 left-0 bottom-0 z-20
          w-[240px] bg-bg-secondary border-r border-border
          flex flex-col py-4 overflow-y-auto
          transition-transform duration-200
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >

        {/* ── Folders section ─────────────────────────────────────────────── */}
        <div className="px-4 mb-1">
          {/* Section header */}
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              <Folder size={12} />
              Folders
            </span>
            <button
              onClick={() => setCreatingFolder(true)}
              title="New folder"
              className="p-0.5 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* New folder input */}
          {creatingFolder && (
            <div className="mb-2">
              <input
                ref={newFolderRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
                placeholder="Folder name…"
                className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-accent/40 rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex gap-1.5 mt-1">
                <button
                  onClick={createFolder}
                  className="flex-1 text-xs py-1 bg-accent text-white rounded-md hover:bg-accent/90"
                >
                  Create
                </button>
                <button
                  onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                  className="flex-1 text-xs py-1 border border-border rounded-md hover:bg-bg-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Folder list */}
          {folders.length === 0 && !creatingFolder ? (
            <p className="text-xs text-text-tertiary px-1 mb-2 leading-relaxed">
              No folders yet. Create one to group related tags.
            </p>
          ) : (
            <div className="space-y-0.5 mb-1">
              {folders.map((folder) => {
                const isExpanded = expandedIds.has(folder.id);
                const isActive = activeFolder === folder.id;
                const isRenaming = renamingId === folder.id;
                const isDeleting = deletingId === folder.id;
                const isAddingTag = addingTagTo === folder.id;
                const matchingTags = isAddingTag ? getMatchingTags(folder.id) : [];

                return (
                  <div key={folder.id}>
                    {/* Folder header row */}
                    <div
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md group cursor-pointer ${
                        isActive ? "bg-accent/10" : "hover:bg-bg-hover"
                      }`}
                    >
                      {/* Expand chevron */}
                      <button
                        onClick={() => toggleExpanded(folder.id)}
                        className="shrink-0 text-text-tertiary hover:text-text-primary"
                      >
                        {isExpanded
                          ? <ChevronDown size={13} />
                          : <ChevronRight size={13} />}
                      </button>

                      {/* Folder icon */}
                      {isExpanded
                        ? <FolderOpen size={14} className={isActive ? "text-accent" : "text-text-secondary"} />
                        : <Folder size={14} className={isActive ? "text-accent" : "text-text-secondary"} />
                      }

                      {/* Name / rename input */}
                      {isRenaming ? (
                        <input
                          ref={renameRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameFolder(folder.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={() => renameFolder(folder.id)}
                          className="flex-1 text-sm bg-transparent border-b border-accent focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            onFolderSelect?.(isActive ? null : folder.id);
                            if (!isExpanded) toggleExpanded(folder.id);
                            onClose();
                          }}
                          className={`flex-1 text-left text-sm truncate ${
                            isActive ? "text-accent font-medium" : "text-text-primary"
                          }`}
                        >
                          {folder.name}
                        </button>
                      )}

                      {/* Tag count badge */}
                      {!isRenaming && (
                        <span className="text-[10px] text-text-tertiary shrink-0 mr-0.5">
                          {folder.tags.length}
                        </span>
                      )}

                      {/* Hover actions */}
                      {!isRenaming && !isDeleting && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(folder.id);
                              setRenameValue(folder.name);
                            }}
                            title="Rename"
                            className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary hover:text-text-primary"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(folder.id);
                            }}
                            title="Delete folder"
                            className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary hover:text-error"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="ml-6 mt-1 mb-1 px-2 py-2 bg-error/5 border border-error/20 rounded-md">
                        <p className="text-xs text-error mb-2">Delete &ldquo;{folder.name}&rdquo;?</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => deleteFolder(folder.id)}
                            className="flex-1 text-xs py-1 bg-error text-white rounded-md hover:bg-error/90"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="flex-1 text-xs py-1 border border-border rounded-md hover:bg-bg-hover"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expanded: tags inside folder */}
                    {isExpanded && !isDeleting && (
                      <div className="ml-7 mt-0.5 mb-1 space-y-0.5">
                        {folder.tags.length === 0 && !isAddingTag && (
                          <p className="text-xs text-text-tertiary px-2 py-1">No tags yet.</p>
                        )}

                        {folder.tags.map((tagName) => (
                          <div
                            key={tagName}
                            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-bg-hover group/tag"
                          >
                            <button
                              onClick={() => {
                                onTagSelect(tagName);
                                onFolderSelect?.(null);
                                onClose();
                              }}
                              className="flex-1 text-left text-xs text-text-secondary hover:text-text-primary truncate"
                            >
                              #{tagName}
                            </button>
                            <button
                              onClick={() => removeTagFromFolder(folder.id, tagName)}
                              title="Remove from folder"
                              className="opacity-0 group-hover/tag:opacity-100 text-text-tertiary hover:text-error shrink-0"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}

                        {/* Add tag to folder */}
                        {isAddingTag ? (
                          <div className="relative px-1">
                            <input
                              ref={tagInputRef}
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && tagInput.trim())
                                  addTagToFolder(folder.id, tagInput.trim());
                                if (e.key === "Escape") {
                                  setAddingTagTo(null);
                                  setTagInput("");
                                }
                              }}
                              placeholder="tag name…"
                              className="w-full px-2 py-1 text-xs bg-bg-primary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                            {/* Autocomplete dropdown */}
                            {matchingTags.length > 0 && (
                              <div className="absolute left-1 right-1 top-full mt-0.5 bg-bg-primary border border-border rounded-md shadow-lg py-1 z-10">
                                {matchingTags.map((t) => (
                                  <button
                                    key={t.name}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      addTagToFolder(folder.id, t.name);
                                    }}
                                    className="w-full text-left px-2 py-1 text-xs hover:bg-bg-hover flex items-center justify-between"
                                  >
                                    <span>#{t.name}</span>
                                    <span className="text-text-tertiary text-[10px]">{t.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingTagTo(folder.id)}
                            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-accent px-2 py-1"
                          >
                            <Plus size={10} /> Add tag
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* AI Suggest button */}
          <button
            onClick={suggestFolders}
            disabled={suggesting || tags.length < 3}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed mt-1 px-1"
            title={tags.length < 3 ? "Add at least 3 tags to get suggestions" : "Let AI group your tags into folders"}
          >
            {suggesting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : suggestResult ? (
              <Check size={11} className="text-green-500" />
            ) : (
              <Sparkles size={11} />
            )}
            {suggesting
              ? "Grouping tags…"
              : suggestResult
              ? suggestResult
              : "Suggest folders"}
          </button>
        </div>

        <div className="mx-4 border-t border-border my-3" />

        {/* ── Tags section ────────────────────────────────────────────────── */}
        <div className="px-4 mb-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            <Tag size={12} />
            {folders.length > 0 ? "Ungrouped" : "Tags"}
          </div>

          {ungroupedTags.length === 0 && folders.length > 0 ? (
            <p className="text-xs text-text-tertiary px-1 mb-3">
              All tags are in folders.
            </p>
          ) : ungroupedTags.length === 0 ? (
            <p className="text-xs text-text-tertiary px-1 mb-3">(none yet)</p>
          ) : (
            <div className="space-y-0.5 mb-3">
              {ungroupedTags.map((tag) => (
                <button
                  key={tag.name}
                  onClick={() => {
                    onTagSelect(activeTag === tag.name ? null : tag.name);
                    onFolderSelect?.(null);
                    onClose();
                  }}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between ${
                    activeTag === tag.name
                      ? "bg-accent-light text-accent font-medium"
                      : "text-text-primary hover:bg-bg-hover"
                  }`}
                >
                  <span className="truncate">{tag.name}</span>
                  <span className="text-[10px] text-text-tertiary shrink-0 ml-1">{tag.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mx-4 border-t border-border mb-3" />

        {/* ── Type filters ─────────────────────────────────────────────────── */}
        <div className="px-4 space-y-0.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                onFilterChange(f.key);
                onTagSelect(null);
                onFolderSelect?.(null);
                onClose();
              }}
              className={`w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center gap-2 transition-colors ${
                activeFilter === f.key && !activeTag && !activeFolder
                  ? "bg-bg-hover text-accent font-medium"
                  : "text-text-primary hover:bg-bg-hover"
              }`}
            >
              <span className="text-text-secondary">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
