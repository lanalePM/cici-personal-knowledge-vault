"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface EmptyStateProps {
  onAddToVault: () => void;
  onSaved: () => void;
}

export default function EmptyState({ onAddToVault, onSaved }: EmptyStateProps) {
  const { addToast } = useToast();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFirstSave(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: url.trim(),
          content_type: "pasted_link",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      addToast({
        type: "success",
        title: "Your vault has begun!",
        duration: 4000,
      });
      setUrl("");
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      addToast({ type: "error", title: message, duration: 5000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] px-4">
      <div className="max-w-lg w-full text-center py-12">

        {/* Mark */}
        <div className="flex justify-center mb-5">
          <span className="text-5xl text-accent leading-none">✦</span>
        </div>

        {/* Tagline */}
        <h1 className="text-2xl font-bold tracking-tight mb-3">
          Save it. Understand it. Build on it.
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          Paste any link and Cici summarizes, tags, and organizes it for you — so nothing worth keeping ever gets lost.
        </p>

        {/* Feature pills */}
        <div className="flex justify-center flex-wrap gap-2 mb-10">
          {["AI summaries", "Smart tagging", "Chat with your vault", "Content discovery"].map((f) => (
            <span
              key={f}
              className="text-xs px-3 py-1.5 bg-accent/10 text-accent rounded-full font-medium"
            >
              {f}
            </span>
          ))}
        </div>

        {/* Save form */}
        <form onSubmit={handleFirstSave} className="space-y-3 max-w-sm mx-auto">
          <input
            type="url"
            placeholder="Paste any link to get started…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Save your first item"}
          </button>
        </form>

        <p className="text-sm text-text-secondary mt-4">
          or{" "}
          <button
            onClick={onAddToVault}
            className="text-accent hover:underline"
          >
            upload a file
          </button>
        </p>

        <p className="text-xs text-text-tertiary mt-8">
          Save while you browse with the{" "}
          <span className="text-accent font-medium">Cici extension</span>
        </p>
      </div>
    </div>
  );
}
