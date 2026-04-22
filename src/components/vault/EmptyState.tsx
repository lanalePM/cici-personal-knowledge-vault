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
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
      <div className="max-w-sm text-center p-8">
        <div className="text-4xl mb-4 text-accent">✦</div>
        <h2 className="text-lg font-semibold mb-2">Save your first item</h2>
        <p className="text-sm text-text-secondary mb-6">
          Paste any link to get started:
        </p>

        <form onSubmit={handleFirstSave} className="space-y-3">
          <input
            type="url"
            placeholder="Paste a URL..."
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
            {loading ? "Saving..." : "Save to vault"}
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

        <p className="text-xs text-text-tertiary mt-6">
          Want to save while you browse? Install the{" "}
          <span className="text-accent">Cici me extension</span>
        </p>
      </div>
    </div>
  );
}
