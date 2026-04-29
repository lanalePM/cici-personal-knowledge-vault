"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { MarkdownText } from "@/components/ui/MarkdownText";
import { useToast } from "@/components/ui/Toast";
import {
  Send,
  Loader2,
  ExternalLink,
  SquarePen,
  Trash2,
  ArrowLeft,
  Menu,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Thread = {
  id: string;
  title: string | null;
  updated_at: string;
  created_at: string;
};

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

// ── Prompt suggestions ───────────────────────────────────────────────────────

const VAULT_PROMPTS = [
  "What are the key ideas across my saves?",
  "Compare the top ideas: where they agree and where they differ.",
  "Explain the most important concepts as a beginner-friendly cheat sheet.",
  "Turn my saved knowledge into a practical checklist I can apply this week.",
];

const ITEM_PROMPTS = [
  "Give me a detailed breakdown: core ideas, assumptions, and caveats.",
  "What are the most important terms and what do they mean?",
  "Summarize this for a non-technical audience, then add a technical version.",
  "What should I do next after reading this? Give me concrete action steps.",
];

// ── Thread grouping ──────────────────────────────────────────────────────────

type ThreadGroup = { label: string; threads: Thread[] };

function groupThreads(threads: Thread[]): ThreadGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const buckets: { label: string; threads: Thread[] }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "Previous 7 days", threads: [] },
    { label: "Older", threads: [] },
  ];

  for (const t of threads) {
    const d = new Date(t.updated_at);
    if (d >= today) buckets[0].threads.push(t);
    else if (d >= yesterday) buckets[1].threads.push(t);
    else if (d >= weekAgo) buckets[2].threads.push(t);
    else buckets[3].threads.push(t);
  }

  return buckets.filter((b) => b.threads.length > 0);
}

function threadLabel(t: Thread): string {
  if (t.title) return t.title;
  const d = new Date(t.created_at);
  return `Chat · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// ── AssistantBody ────────────────────────────────────────────────────────────

function AssistantBody({ content, sources }: { content: string; sources?: ChatSource[] }) {
  return (
    <>
      <MarkdownText>{content}</MarkdownText>
      {sources && sources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
            Sources
          </p>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.item_id}>
                {s.source_url ? (
                  <div className="flex flex-col gap-0.5">
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-accent text-sm hover:underline underline-offset-2 font-medium"
                    >
                      {s.title}
                      <ExternalLink size={13} className="shrink-0 opacity-80" aria-hidden />
                    </a>
                    <Link
                      href={s.href}
                      prefetch
                      className="text-xs text-text-tertiary hover:text-text-secondary hover:underline pl-0.5"
                    >
                      Saved copy in your library
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={s.href}
                    prefetch
                    className="text-accent text-sm hover:underline underline-offset-2"
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

// ── Main component ───────────────────────────────────────────────────────────

export default function AskClient() {
  const router = useRouter();
  const params = useSearchParams();
  const presetItemId = params.get("item");
  const { addToast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scope = presetItemId ? "item" : "topic";
  const baseSuggestions = presetItemId ? ITEM_PROMPTS : VAULT_PROMPTS;

  const suggestions = useMemo(() => {
    const lastQ = [...messages].reverse().find((m) => m.role === "user")?.content.trim();
    if (!lastQ) return baseSuggestions.slice(0, 4);
    const clipped = lastQ.length > 80 ? `${lastQ.slice(0, 80)}…` : lastQ;
    return [
      `Go deeper on "${clipped}" — include examples and common pitfalls.`,
      `Rewrite your last answer as a clear step-by-step guide.`,
      ...baseSuggestions,
    ].slice(0, 4);
  }, [messages, baseSuggestions]);

  // Scroll to the bottom of the messages container
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior,
        });
      }
    });
  }, []);

  // Load messages for a thread (instant scroll — no visible glide)
  const loadMessages = useCallback(
    async (threadId: string) => {
      const res = await fetch(`/api/chat?thread_id=${threadId}`);
      if (!res.ok) return;
      const data = await res.json();
      const raw = data.messages || [];
      setMessages(
        raw.map(
          (m: {
            id: string;
            role: string;
            content: string;
            sources?: ChatSource[];
          }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            sources:
              m.role === "assistant" && m.sources?.length ? m.sources : undefined,
          })
        )
      );
      scrollToBottom("instant");
    },
    [scrollToBottom]
  );

  // Initial load
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/chat");
        if (!res.ok) return;
        const data = await res.json();
        const list: Thread[] = data.threads || [];
        setThreads(list);

        // If coming from an item page, start a fresh scoped conversation
        if (!presetItemId && list.length > 0) {
          setActiveThreadId(list[0].id);
          await loadMessages(list[0].id);
        }
      } catch {
        /* ignore */
      } finally {
        setHydrated(true);
      }
    }
    init();
  }, [loadMessages, presetItemId]);

  async function submitMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    const optimistic: ChatRow = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, optimistic]);
    scrollToBottom("smooth");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          message: text,
          item_id: scope === "item" ? presetItemId : undefined,
          thread_id: activeThreadId ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      const returnedThreadId: string = data.thread_id;
      const apiSources = (data.sources || []) as ChatSource[];

      // New thread was just created — add it to the sidebar
      if (!activeThreadId && returnedThreadId) {
        const newThread: Thread = {
          id: returnedThreadId,
          title: text.length > 70 ? `${text.slice(0, 70)}…` : text,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        setThreads((ts) => [newThread, ...ts]);
        setActiveThreadId(returnedThreadId);
      } else {
        // Bump updated_at for the existing thread so it stays at the top
        setThreads((ts) =>
          ts.map((t) =>
            t.id === activeThreadId
              ? { ...t, updated_at: new Date().toISOString() }
              : t
          )
        );
      }

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
      scrollToBottom("smooth");
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

  function applyPrompt(prompt: string, sendNow = false) {
    setInput(prompt);
    inputRef.current?.focus();
    if (sendNow) void submitMessage(prompt);
  }

  function startNewChat() {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setMobileSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function switchThread(threadId: string) {
    if (threadId === activeThreadId) {
      setMobileSidebarOpen(false);
      return;
    }
    setMessages([]);
    setActiveThreadId(threadId);
    setMobileSidebarOpen(false);
    await loadMessages(threadId);
  }

  async function deleteThread(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/chat?thread_id=${threadId}`, { method: "DELETE" });
    const remaining = threads.filter((t) => t.id !== threadId);
    setThreads(remaining);
    if (activeThreadId === threadId) {
      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].id);
        await loadMessages(remaining[0].id);
      } else {
        setActiveThreadId(null);
        setMessages([]);
      }
    }
  }

  const threadGroups = useMemo(() => groupThreads(threads), [threads]);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      <TopBar
        onMenuToggle={() => setMobileSidebarOpen((o) => !o)}
        onSearch={(q) => {
          if (q) router.push(`/vault?search=${encodeURIComponent(q)}`);
        }}
        searchQuery=""
      />

      <div className="flex flex-1 min-h-0">
        {/* Mobile sidebar backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-20 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* ── Threads sidebar ─────────────────────────────────────────────── */}
        <aside
          className={`
            fixed lg:static top-14 left-0 bottom-0 z-20
            w-[220px] bg-bg-secondary border-r border-border
            flex flex-col
            transition-transform duration-200
            ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          {/* New chat button */}
          <div className="p-3 border-b border-border shrink-0">
            <button
              type="button"
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <SquarePen size={14} />
              New chat
            </button>
          </div>

          {/* Back to library */}
          <div className="px-4 py-2.5 border-b border-border shrink-0">
            <Link
              href="/vault"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
            >
              <ArrowLeft size={12} />
              Back to library
            </Link>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto py-2">
            {threadGroups.length === 0 ? (
              <p className="px-4 py-3 text-xs text-text-tertiary">
                No conversations yet.
              </p>
            ) : (
              threadGroups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {group.label}
                  </p>
                  {group.threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void switchThread(t.id)}
                      className={`group w-full text-left px-4 py-2 text-sm flex items-start justify-between gap-2 transition-colors ${
                        t.id === activeThreadId
                          ? "bg-bg-hover text-text-primary font-medium"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      }`}
                    >
                      <span className="line-clamp-2 flex-1 leading-snug">
                        {threadLabel(t)}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => void deleteThread(t.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void deleteThread(t.id, e as unknown as React.MouseEvent);
                          }
                        }}
                        title="Delete conversation"
                        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:text-error transition-opacity mt-0.5"
                      >
                        <Trash2 size={13} />
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Chat main area ───────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
            >
              <Menu size={18} />
            </button>
            <h2 className="font-semibold text-sm truncate flex-1">
              {activeThread
                ? threadLabel(activeThread)
                : activeThreadId
                ? "Conversation"
                : "New conversation"}
            </h2>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNewChat}
                title="Start new chat"
                className="shrink-0 p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              >
                <SquarePen size={15} />
              </button>
            )}
          </div>

          {/* Item scope banner */}
          {presetItemId && (
            <div className="mx-4 mt-3 text-sm bg-accent-light border border-border rounded-lg px-3 py-2 shrink-0">
              Asking about{" "}
              <Link className="text-accent font-medium" href={`/vault/${presetItemId}`}>
                one saved item
              </Link>
              .{" "}
              <Link className="text-accent font-medium" href="/ask">
                Switch to all saves →
              </Link>
            </div>
          )}

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 px-2 space-y-4">
                <p className="text-sm text-text-tertiary text-center max-w-sm">
                  {presetItemId
                    ? "Ask anything about this saved item."
                    : "Ask anything about what you've saved."}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-md">
                  {baseSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={loading}
                      onClick={() => applyPrompt(prompt, true)}
                      className="text-left text-sm px-4 py-3 rounded-lg border border-border bg-bg-secondary hover:bg-bg-hover text-text-primary transition-colors disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                      msg.role === "user"
                        ? "bg-accent text-white text-sm whitespace-pre-wrap"
                        : "bg-bg-secondary border border-border"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <AssistantBody content={msg.content} sources={msg.sources} />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-bg-secondary border border-border rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 size={16} className="animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Suggestion chips — active conversation only */}
          {messages.length > 0 && (
            <div className="flex gap-2 flex-wrap px-4 py-2 shrink-0">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => applyPrompt(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-bg-secondary hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 px-4 py-3 border-t border-border shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitMessage();
                }
              }}
              rows={3}
              placeholder="Ask about your vault…"
              className="flex-1 resize-none bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="button"
              onClick={() => void submitMessage()}
              disabled={loading || !input.trim()}
              className="self-end px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
