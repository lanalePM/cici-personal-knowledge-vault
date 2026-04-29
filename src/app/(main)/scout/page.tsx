"use client";

import { useState, useEffect, useCallback } from "react";
import TopBar from "@/components/layout/TopBar";
import { SUGGESTED_FEEDS } from "@/lib/ai/scout-constants";
import {
  Play, Plus, Trash2, ExternalLink, BookmarkPlus, X,
  RefreshCw, ChevronDown, ChevronUp, Rss, Sparkles,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Source = {
  id: string;
  label: string;
  feed_url: string;
  active: boolean;
  created_at: string;
};

type Suggestion = {
  id: string;
  source_label: string;
  title: string;
  url: string;
  description: string | null;
  published_at: string | null;
  relevance_score: number;
  relevance_reason: string;
  status: "pending" | "saved" | "dismissed";
  created_at: string;
};

type TabStatus = "pending" | "saved" | "dismissed";

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 5
      ? "bg-green-100 text-green-700"
      : score >= 4
      ? "bg-accent-light text-accent"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${cls}`}>
      {score}
    </span>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onSave,
  onDismiss,
  onRestore,
}: {
  suggestion: Suggestion;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const date = suggestion.published_at
    ? new Date(suggestion.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className={`border border-border rounded-xl p-4 flex flex-col gap-3 bg-bg-primary transition-opacity ${suggestion.status !== "pending" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <ScoreBadge score={suggestion.relevance_score} />
        <div className="flex-1 min-w-0">
          <a
            href={suggestion.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-text-primary hover:text-accent hover:underline leading-snug line-clamp-2 flex items-start gap-1 group"
          >
            {suggestion.title}
            <ExternalLink size={11} className="shrink-0 mt-0.5 opacity-30 group-hover:opacity-80 transition-opacity" />
          </a>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
            <span className="font-medium text-text-secondary">{suggestion.source_label}</span>
            {date && <><span>·</span><span>{date}</span></>}
          </div>
        </div>
      </div>

      <p className="text-xs text-text-secondary italic leading-relaxed">
        {suggestion.relevance_reason}
      </p>

      {suggestion.description && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Hide description" : "Show description"}
          </button>
          {expanded && (
            <p className="mt-2 text-xs text-text-tertiary leading-relaxed">
              {suggestion.description}
            </p>
          )}
        </div>
      )}

      {suggestion.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => onSave(suggestion.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90"
          >
            <BookmarkPlus size={13} /> Save to vault
          </button>
          <button
            onClick={() => onDismiss(suggestion.id)}
            className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 border border-border rounded-lg hover:bg-bg-hover text-text-secondary"
          >
            <X size={13} /> Dismiss
          </button>
        </div>
      )}

      {suggestion.status !== "pending" && (
        <button
          onClick={() => onRestore(suggestion.id)}
          className="text-xs text-text-tertiary hover:text-text-secondary text-left"
        >
          ↩ Move back to pending
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScoutPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ found: number; sources_checked: number } | null>(null);
  const [manualInterests, setManualInterests] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [showSuggestedFeeds, setShowSuggestedFeeds] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    loadSources();
    const saved = localStorage.getItem("cici-scout-interests");
    if (saved) setManualInterests(saved);
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [activeTab]);

  async function loadSources() {
    const res = await fetch("/api/scout/sources");
    const data = await res.json();
    setSources(data.sources ?? []);
  }

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/scout/suggestions?status=${activeTab}`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [activeTab]);

  async function addSource() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const res = await fetch("/api/scout/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim(), feed_url: newUrl.trim() }),
    });
    if (res.ok) {
      setNewLabel("");
      setNewUrl("");
      setAddingSource(false);
      loadSources();
    }
  }

  async function addSuggestedFeed(feed: { label: string; url: string }) {
    await fetch("/api/scout/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: feed.label, feed_url: feed.url }),
    });
    loadSources();
  }

  async function deleteSource(id: string) {
    await fetch(`/api/scout/sources/${id}`, { method: "DELETE" });
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function toggleSource(id: string, active: boolean) {
    await fetch(`/api/scout/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, active: !active } : s));
  }

  async function runScout() {
    setRunning(true);
    setRunResult(null);
    try {
      localStorage.setItem("cici-scout-interests", manualInterests);
      const res = await fetch("/api/scout/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual_interests: manualInterests }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Scout run failed");
        return;
      }
      setRunResult({ found: data.found, sources_checked: data.sources_checked });
      setActiveTab("pending");
      await loadSuggestions();
    } finally {
      setRunning(false);
    }
  }

  async function updateStatus(id: string, status: "saved" | "dismissed" | "pending") {
    // Optimistic update
    setSuggestions((prev) => prev.filter((s) => s.id !== id));

    if (status === "saved") {
      // Save to vault — include full_content as page_text fallback
      // so processItem can summarize even if the live page can't be scraped
      const suggestion = suggestions.find((s) => s.id === id);
      if (suggestion) {
        await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_url: suggestion.url,
            title: suggestion.title,
            content_type: "link",
            // RSS description as lightweight fallback — processItem tries the
            // live page first; only uses this if the page can't be scraped
            page_text: suggestion.description || undefined,
          }),
        });
      }
    }

    await fetch(`/api/scout/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  const existingUrls = new Set(sources.map((s) => s.feed_url));
  const unaddedFeeds = SUGGESTED_FEEDS.filter((f) => !existingUrls.has(f.url));

  const tabs: { key: TabStatus; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "saved", label: "Saved" },
    { key: "dismissed", label: "Dismissed" },
  ];

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary">
      <TopBar
        onSearch={() => {}}
        searchQuery=""
      />

      <div className="flex flex-1 min-h-0">
        {/* ── Left panel: controls ── */}
        <aside className="w-72 shrink-0 border-r border-border flex-col overflow-y-auto hidden lg:flex">

          {/* Interest profile */}
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Interest Profile</h2>
            </div>
            <p className="text-xs text-text-tertiary">
              Your vault tags are used automatically. Add anything new here.
            </p>
            <textarea
              value={manualInterests}
              onChange={(e) => setManualInterests(e.target.value)}
              placeholder="e.g. product-led growth, LLM fine-tuning, startup fundraising…"
              rows={3}
              className="w-full text-xs bg-bg-secondary border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-text-tertiary"
            />
          </div>

          {/* Sources */}
          <div className="p-4 border-b border-border flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rss size={14} className="text-accent" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Sources</h2>
              </div>
              <button
                onClick={() => setAddingSource(!addingSource)}
                className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary"
                title="Add source"
              >
                <Plus size={14} />
              </button>
            </div>

            {addingSource && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Label (e.g. My Blog)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="text-xs bg-bg-secondary border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <input
                  type="url"
                  placeholder="RSS feed URL"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="text-xs bg-bg-secondary border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  onKeyDown={(e) => e.key === "Enter" && addSource()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={addSource}
                    className="flex-1 text-xs bg-accent text-white rounded-md py-1.5 hover:bg-accent/90"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingSource(false); setNewLabel(""); setNewUrl(""); }}
                    className="flex-1 text-xs border border-border rounded-md py-1.5 hover:bg-bg-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              {sources.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-4">No sources yet. Add one above or pick from suggestions below.</p>
              ) : (
                sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover group">
                    <button
                      onClick={() => toggleSource(s.id, s.active)}
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${s.active ? "bg-accent border-accent" : "border-border"}`}
                      title={s.active ? "Disable" : "Enable"}
                    >
                      {s.active && <span className="text-white text-[10px]">✓</span>}
                    </button>
                    <span className={`flex-1 text-xs truncate ${!s.active ? "text-text-tertiary line-through" : ""}`}>
                      {s.label}
                    </span>
                    <button
                      onClick={() => deleteSource(s.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-error"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {unaddedFeeds.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSuggestedFeeds(!showSuggestedFeeds)}
                  className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
                >
                  {showSuggestedFeeds ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {unaddedFeeds.length} suggested feeds
                </button>
                {showSuggestedFeeds && (
                  <div className="mt-2 flex flex-col gap-1">
                    {unaddedFeeds.map((f) => (
                      <button
                        key={f.url}
                        onClick={() => addSuggestedFeed(f)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover text-left group w-full"
                      >
                        <Plus size={12} className="shrink-0 text-text-tertiary group-hover:text-accent" />
                        <span className="text-xs text-text-secondary truncate">{f.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Run button */}
          <div className="p-4 flex flex-col gap-2">
            <button
              onClick={runScout}
              disabled={running || sources.filter((s) => s.active).length === 0}
              className="flex items-center justify-center gap-2 bg-accent text-white text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? (
                <><RefreshCw size={14} className="animate-spin" /> Scouting…</>
              ) : (
                <><Play size={14} /> Run Scout</>
              )}
            </button>
            {running && (
              <p className="text-xs text-text-tertiary text-center">Fetching feeds and scoring articles…</p>
            )}
            {runResult && !running && (
              <p className="text-xs text-text-tertiary text-center">
                Found <strong>{runResult.found}</strong> new relevant articles from {runResult.sources_checked} sources.
              </p>
            )}
            {sources.filter((s) => s.active).length === 0 && !running && (
              <p className="text-xs text-amber-600 text-center">Enable at least one source first.</p>
            )}
          </div>
        </aside>

        {/* ── Right panel: suggestions ── */}
        <main className="flex-1 overflow-y-auto flex flex-col">

          {/* Mobile run bar */}
          <div className="lg:hidden p-4 border-b border-border flex flex-wrap items-center gap-3">
            <textarea
              value={manualInterests}
              onChange={(e) => setManualInterests(e.target.value)}
              placeholder="Additional interests…"
              rows={2}
              className="w-full text-xs bg-bg-secondary border border-border rounded-md px-3 py-2 resize-none focus:outline-none"
            />
            <button
              onClick={runScout}
              disabled={running}
              className="flex items-center gap-2 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-50"
            >
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? "Scouting…" : "Run Scout"}
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-border px-6 flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Suggestion list */}
          <div className="flex-1 p-6">
            {loadingSuggestions ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-bg-secondary rounded-xl animate-pulse" />
                ))}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
                <div className="text-4xl opacity-20">✦</div>
                <p className="text-text-secondary text-sm max-w-xs">
                  {activeTab === "pending"
                    ? "No suggestions yet. Add sources and run the scout to find relevant articles."
                    : `No ${activeTab} articles.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-4xl">
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onSave={(id) => updateStatus(id, "saved")}
                    onDismiss={(id) => updateStatus(id, "dismissed")}
                    onRestore={(id) => updateStatus(id, "pending")}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
