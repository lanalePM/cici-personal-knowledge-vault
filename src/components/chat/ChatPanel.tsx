"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Send, Loader2, ExternalLink, Maximize2, X, BookOpen, RotateCcw } from "lucide-react";
import { MarkdownText } from "@/components/ui/MarkdownText";
import { useToast } from "@/components/ui/Toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatSource = {
  item_id: string;
  title: string;
  href: string;
  source_url?: string | null;
};

type ChatRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

// ── Suggested prompts ─────────────────────────────────────────────────────────

const VAULT_PROMPTS = [
  "What are the key ideas across my saves?",
  "Explain the most important concepts as a beginner-friendly cheat sheet.",
  "Compare the top ideas: where they agree and where they differ.",
];

const ITEM_PROMPTS = [
  "Give me a detailed breakdown: core ideas, assumptions, and caveats.",
  "What are the most important terms and what do they mean?",
  "What should I do next after reading this? Give me concrete action steps.",
];

const DEEP_DIVE_FALLBACK = [
  "Give me a detailed breakdown: core ideas, assumptions, and caveats.",
  "What are the most important terms and what do they mean?",
  "What should I do next after reading this? Give me concrete action steps.",
  "What questions does this content leave unanswered?",
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  itemId?: string;
  onExpand: () => void;
  onClose?: () => void;
};

// ── AssistantBubble ───────────────────────────────────────────────────────────

function AssistantBubble({ content, sources }: { content: string; sources?: ChatSource[] }) {
  return (
    <>
      <MarkdownText className="text-xs text-text-primary leading-relaxed">{content}</MarkdownText>
      {sources && sources.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1">
            Sources
          </p>
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li key={s.item_id}>
                {s.source_url ? (
                  <div className="flex flex-col gap-0.5">
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent text-[11px] hover:underline font-medium"
                    >
                      {s.title}
                      <ExternalLink size={10} className="shrink-0" aria-hidden />
                    </a>
                    <Link
                      href={s.href}
                      prefetch
                      className="text-[10px] text-text-tertiary hover:underline pl-0.5"
                    >
                      Saved copy
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={s.href}
                    prefetch
                    className="text-accent text-[11px] hover:underline"
                  >
                    {s.title}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPanel({ itemId, onExpand, onClose }: Props) {
  const { addToast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deepDive, setDeepDive] = useState(false);
  const [articlePrompts, setArticlePrompts] = useState<string[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadRestoring, setThreadRestoring] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scope = itemId ? "item" : "topic";

  // localStorage key scoped to the specific item (or "vault" for the global panel)
  const storageKey = useMemo(
    () => (itemId ? `cici-thread-item-${itemId}` : "cici-thread-vault"),
    [itemId]
  );

  // ── Thread restore on mount / item change ─────────────────────────────────

  useEffect(() => {
    // Reset for the new context
    setMessages([]);
    setDeepDive(false);
    setThreadId(null);
    setArticlePrompts([]);

    // Try to restore a previous thread
    const savedThread = localStorage.getItem(storageKey);
    if (savedThread) {
      setThreadRestoring(true);
      fetch(`/api/chat?thread_id=${savedThread}`)
        .then((r) => r.json())
        .then((data: { messages?: { id: string; role: string; content: string; sources?: ChatSource[] }[] }) => {
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setThreadId(savedThread);
            setMessages(
              data.messages.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                sources: m.sources,
              }))
            );
          } else {
            localStorage.removeItem(storageKey);
          }
        })
        .catch(() => localStorage.removeItem(storageKey))
        .finally(() => setThreadRestoring(false));
    }

    // Fetch article-specific prompts when viewing an item
    if (itemId) {
      setPromptsLoading(true);
      fetch(`/api/items/${itemId}/prompts`)
        .then((r) => r.json())
        .then((data: { prompts?: string[] }) => {
          if (Array.isArray(data.prompts) && data.prompts.length > 0) {
            setArticlePrompts(data.prompts);
          }
        })
        .catch(() => {})
        .finally(() => setPromptsLoading(false));
    }
  }, [storageKey, itemId]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Suggested prompts ─────────────────────────────────────────────────────

  const baseSuggestions = useMemo(() => {
    if (!itemId) return VAULT_PROMPTS;
    if (deepDive) return articlePrompts.length > 0 ? articlePrompts : DEEP_DIVE_FALLBACK;
    return articlePrompts.length > 0 ? articlePrompts : ITEM_PROMPTS;
  }, [itemId, deepDive, articlePrompts]);

  const suggestions = useMemo(() => {
    const lastQ = [...messages].reverse().find((m) => m.role === "user")?.content.trim();
    if (!lastQ) return baseSuggestions;
    const clipped = lastQ.length > 55 ? `${lastQ.slice(0, 55)}…` : lastQ;
    return [
      `Go deeper: "${clipped}"`,
      `Rewrite as a step-by-step guide.`,
      ...baseSuggestions,
    ].slice(0, 3);
  }, [messages, baseSuggestions]);

  // ── Clear thread ──────────────────────────────────────────────────────────

  function clearThread() {
    localStorage.removeItem(storageKey);
    setThreadId(null);
    setMessages([]);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function submitMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    const optimistic: ChatRow = { id: `temp-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, optimistic]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          message: text,
          item_id: scope === "item" ? itemId : undefined,
          deep_dive: scope === "item" ? deepDive : undefined,
          thread_id: threadId ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      // Persist thread ID for next session
      if (data.thread_id) {
        setThreadId(data.thread_id);
        localStorage.setItem(storageKey, data.thread_id);
      }

      const apiSources = (data.sources || []) as ChatSource[];
      setMessages((m) => {
        const without = m.filter((x) => x.id !== optimistic.id);
        return [
          ...without,
          { id: `u-${Date.now()}`, role: "user", content: text },
          {
            id: data.assistant_message_id || `a-${Date.now()}`,
            role: "assistant",
            content: data.answer as string,
            sources: apiSources.length ? apiSources : undefined,
          },
        ];
      });
    } catch (e: unknown) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      addToast({
        type: "error",
        title: e instanceof Error ? e.message : "Ask Cici failed",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-bg-primary">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="text-accent text-base">✦</span>
          Ask Cici
        </span>
        <div className="flex items-center gap-1">

          {/* Deep Dive toggle — only when viewing a specific item */}
          {itemId && (
            <button
              type="button"
              onClick={() => setDeepDive((d) => !d)}
              title={
                deepDive
                  ? "Switch back to smart search mode (RAG)"
                  : "Deep Dive: load the full article into context for richer, more thorough answers"
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                deepDive
                  ? "bg-accent text-white"
                  : "bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              <BookOpen size={11} />
              Deep Dive
            </button>
          )}

          {/* New chat — clears thread */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearThread}
              title="Start a new conversation"
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={onExpand}
            title="Open full chat"
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <Maximize2 size={14} />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Deep Dive mode indicator */}
      {itemId && deepDive && (
        <div className="px-3 py-1.5 bg-accent/8 border-b border-accent/20 shrink-0">
          <p className="text-[11px] text-accent">
            <span className="font-medium">Deep Dive on:</span> full article loaded — Cici reads the whole text.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {threadRestoring ? (
          <div className="flex items-center gap-2 pt-3 px-1 text-xs text-text-tertiary">
            <Loader2 size={12} className="animate-spin" />
            Restoring conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-text-tertiary px-0.5 mb-0.5">
              {itemId
                ? deepDive
                  ? "Ask anything — Cici has the full article in context."
                  : "Ask anything about this item."
                : "Ask anything about your vault."}
            </p>
            {promptsLoading && itemId ? (
              <div className="flex items-center gap-2 text-xs text-text-tertiary px-0.5">
                <Loader2 size={11} className="animate-spin" />
                Generating questions…
              </div>
            ) : (
              baseSuggestions.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={loading}
                  onClick={() => void submitMessage(p)}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-bg-secondary hover:bg-bg-hover text-text-primary transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 ${
                  msg.role === "user"
                    ? "bg-accent text-white text-xs whitespace-pre-wrap"
                    : "bg-bg-secondary border border-border"
                }`}
              >
                {msg.role === "assistant" ? (
                  <AssistantBubble content={msg.content} sources={msg.sources} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-bg-secondary border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 size={13} className="animate-spin" />
              {deepDive ? "Reading full article…" : "Thinking…"}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips — shown when conversation is active */}
      {messages.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-3 py-2 border-t border-border shrink-0">
          {suggestions.map((p) => (
            <button
              key={p}
              type="button"
              disabled={loading}
              onClick={() => {
                setInput(p);
                inputRef.current?.focus();
              }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-bg-secondary hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-border shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitMessage();
            }
          }}
          placeholder={deepDive ? "Ask anything about this article…" : "Ask…"}
          className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={() => void submitMessage()}
          disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
