"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import Sidebar, { type FilterType, type FolderWithTags } from "@/components/layout/Sidebar";
import ItemCard from "@/components/vault/ItemCard";
import AddToVaultModal from "@/components/vault/AddToVaultModal";
import EmptyState from "@/components/vault/EmptyState";
import ChatPanel from "@/components/chat/ChatPanel";
import { useToast } from "@/components/ui/Toast";
import type { ItemWithTags } from "@/types/database";
import { Plus, ChevronDown, ChevronUp, X } from "lucide-react";

type SortOption = "newest" | "oldest" | "title";

export default function VaultPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [items, setItems] = useState<ItemWithTags[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [folders, setFolders] = useState<FolderWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [sort, setSortState] = useState<SortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("cici-sort") as SortOption | null;
    if (saved && ["newest", "oldest", "title"].includes(saved)) {
      setSortState(saved);
    }
  }, []);

  function setSort(value: SortOption) {
    setSortState(value);
    localStorage.setItem("cici-sort", value);
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ItemWithTags[] | null>(
    null
  );

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(data.folders || []);
    } catch {
      // Folders are an enhancement — fail silently
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("content_type", filter);
      if (activeTag) params.set("tag", activeTag);
      if (activeFolder) params.set("folder_id", activeFolder);
      params.set("sort", sort);

      const res = await fetch(`/api/items?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTags(data.tags || []);
    } catch {
      addToast({ type: "error", title: "Failed to load vault", duration: 5000 });
    } finally {
      setLoading(false);
    }
  }, [filter, activeTag, activeFolder, sort, addToast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Poll for updates when any items are still processing
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const hasProcessing = items.some((item) => item.status === "processing");
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchItems();
      }, 4000);
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [items, fetchItems]);

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      addToast({ type: "error", title: "Search failed", duration: 5000 });
    }
  }

  const displayItems = searchResults ?? items;

  const recentItems =
    !searchResults && sort === "newest" && filter === "all" && !activeTag
      ? displayItems.filter((item) => {
          const diff =
            Date.now() - new Date(item.created_at).getTime();
          return diff < 48 * 60 * 60 * 1000;
        })
      : [];

  const remainingItems =
    recentItems.length > 0
      ? displayItems.filter(
          (item) => !recentItems.find((r) => r.id === item.id)
        )
      : displayItems;

  const sortLabel: Record<SortOption, string> = {
    newest: "Newest",
    oldest: "Oldest",
    title: "Title A–Z",
  };

  // Close sort dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !isInputFocused()) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
      }
      if (e.key === "n" && !isInputFocused()) {
        e.preventDefault();
        setModalOpen(true);
      }
      if (e.key === "Escape") {
        setModalOpen(false);
        setSortOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary">
      <TopBar
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSearch={handleSearch}
        searchQuery={searchQuery}
      />

      <div className="flex">
        <Sidebar
          tags={tags}
          activeFilter={filter}
          activeTag={activeTag}
          onFilterChange={(f) => {
            setFilter(f);
            setActiveFolder(null);
            setSearchResults(null);
            setSearchQuery("");
          }}
          onTagSelect={(t) => {
            setActiveTag(t);
            setActiveFolder(null);
            setSearchResults(null);
            setSearchQuery("");
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          folders={folders}
          activeFolder={activeFolder}
          onFolderSelect={(id) => {
            setActiveFolder(id);
            setActiveTag(null);
            setSearchResults(null);
            setSearchQuery("");
          }}
          onFoldersChange={fetchFolders}
        />

        <main className="flex-1 min-w-0">
          {loading ? (
            <div className="p-8">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-bg-secondary rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ) : displayItems.length === 0 && !searchResults ? (
            <EmptyState
              onAddToVault={() => setModalOpen(true)}
              onSaved={fetchItems}
            />
          ) : (
            <div className="p-6">
              {searchResults ? (
                <div className="mb-6">
                  <p className="text-sm text-text-secondary">
                    Search results for
                  </p>
                  <h1 className="text-lg font-semibold">
                    &ldquo;{searchQuery}&rdquo;
                  </h1>
                  <p className="text-[13px] text-text-secondary mt-1">
                    {searchResults.length} result
                    {searchResults.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ) : (
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-lg font-semibold">
                      {activeFolder
                        ? (folders.find((f) => f.id === activeFolder)?.name ?? "Folder")
                        : activeTag
                        ? `#${activeTag}`
                        : filter === "all"
                        ? "All items"
                        : `${filter.charAt(0).toUpperCase() + filter.slice(1)}s`}
                    </h1>
                    <p className="text-[13px] text-text-secondary mt-0.5">
                      {displayItems.length} item
                      {displayItems.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Sort dropdown — click-to-open */}
                    <div className="relative" ref={sortRef}>
                      <button
                        onClick={() => setSortOpen((o) => !o)}
                        className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
                      >
                        Sort: {sortLabel[sort]}
                        {sortOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {sortOpen && (
                        <div className="absolute right-0 top-7 bg-bg-primary border border-border rounded-lg shadow-lg py-1 w-36 z-10">
                          {(Object.entries(sortLabel) as [SortOption, string][]).map(
                            ([key, label]) => (
                              <button
                                key={key}
                                onClick={() => {
                                  setSort(key);
                                  setSortOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-hover ${
                                  sort === key ? "text-accent font-medium" : ""
                                }`}
                              >
                                {label}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Add to vault — keyboard shortcut hint */}
                    <button
                      onClick={() => setModalOpen(true)}
                      title="Add to vault (press N)"
                      className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors"
                    >
                      <Plus size={16} />
                      Add to vault
                      <kbd className="ml-0.5 text-white/60 text-[10px] font-mono border border-white/30 rounded px-1 py-px hidden sm:inline-block">
                        N
                      </kbd>
                    </button>
                  </div>
                </div>
              )}

              {searchResults && searchResults.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-text-secondary">
                    No results for &ldquo;{searchQuery}&rdquo;
                  </p>
                  <p className="text-sm text-text-tertiary mt-1">
                    Try different keywords or a broader search.
                  </p>
                </div>
              ) : (
                <>
                  {recentItems.length > 0 && (
                    <>
                      <p className="text-[13px] text-text-tertiary mb-2">
                        Recently saved
                      </p>
                      <div className="border border-border rounded-lg overflow-hidden mb-6">
                        {recentItems.map((item) => (
                          <ItemCard key={item.id} item={item} />
                        ))}
                      </div>
                      <div className="border-t border-dashed border-border mb-6" />
                    </>
                  )}

                  <div className="border border-border rounded-lg overflow-hidden">
                    {remainingItems.map((item) => (
                      <ItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <AddToVaultModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchItems}
      />

      {/* Floating Cici chat — fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {chatOpen && (
          <div className="w-[360px] h-[min(500px,calc(100vh-140px))] bg-bg-primary border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <ChatPanel
              onExpand={() => {
                setChatOpen(false);
                router.push("/ask");
              }}
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setChatOpen((o) => !o)}
          title={chatOpen ? "Close chat" : "Ask Cici"}
          className="flex items-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg transition-colors"
        >
          {chatOpen ? (
            <X size={17} />
          ) : (
            <span className="text-base leading-none">✦</span>
          )}
          <span className="text-sm font-medium">{chatOpen ? "Close" : "Ask Cici"}</span>
        </button>
      </div>
    </div>
  );
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el?.getAttribute("contenteditable") === "true"
  );
}
