"use client";

import { useState, useRef } from "react";
import { X, Link2, Paperclip, Upload } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface AddToVaultModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "link" | "upload";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.gif,.webp";

export default function AddToVaultModal({
  open,
  onClose,
  onSaved,
}: AddToVaultModalProps) {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>("link");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setUrl("");
    setNote("");
    setFile(null);
    setLoading(false);
    setDuplicateUrl(null);
    setFileError("");
    setTab("link");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelect(f: File) {
    setFileError("");
    if (f.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum size is 5 MB.");
      return;
    }
    setFile(f);
  }

  async function handleSaveLink(e: React.FormEvent) {
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
          note: note.trim(),
          ...(duplicateUrl ? { force: true } : {}),
        }),
      });

      const data = await res.json();

      if (data.duplicate) {
        setDuplicateUrl(data.existing_id);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Failed to save");

      addToast({
        type: "success",
        title: "Saved to vault",
        subtitle: data.title || url,
        duration: 3000,
      });
      handleClose();
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      addToast({ type: "error", title: message, duration: 5000 });
      setLoading(false);
    }
  }

  async function handleSaveFile(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (note.trim()) formData.append("note", note.trim());

      const res = await fetch("/api/items", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      addToast({
        type: "success",
        title: "Saved to vault",
        subtitle: file.name,
        duration: 3000,
      });
      handleClose();
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      addToast({ type: "error", title: message, duration: 5000 });
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-[520px] bg-bg-primary rounded-xl shadow-2xl p-8 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add to vault</h2>
          <button
            onClick={handleClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("link")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border transition-colors ${
              tab === "link"
                ? "border-accent text-accent bg-accent-light"
                : "border-border text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <Link2 size={14} /> Paste a link
          </button>
          <button
            onClick={() => setTab("upload")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border transition-colors ${
              tab === "upload"
                ? "border-accent text-accent bg-accent-light"
                : "border-border text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <Paperclip size={14} /> Upload a file
          </button>
        </div>

        <div className="border-t border-border mb-6" />

        {tab === "link" ? (
          <form onSubmit={handleSaveLink} className="space-y-4">
            <input
              type="url"
              placeholder="Paste a URL..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setDuplicateUrl(null);
              }}
              required
              className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />

            {duplicateUrl && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm">
                You already saved this URL.{" "}
                <a
                  href={`/vault/${duplicateUrl}`}
                  className="text-accent hover:underline"
                >
                  View item →
                </a>
              </div>
            )}

            <textarea
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
            />

            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
              >
                {loading
                  ? "Saving..."
                  : duplicateUrl
                  ? "Save anyway"
                  : "Save to vault"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveFile} className="space-y-4">
            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileSelect(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-accent bg-accent-light"
                    : "border-border bg-bg-secondary hover:border-accent/50"
                }`}
              >
                <Upload
                  size={24}
                  className="mx-auto mb-2 text-text-tertiary"
                />
                <p className="text-sm text-text-secondary">
                  Drop files here or click to browse
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  PDF or images · Max 5 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-bg-secondary border border-border rounded-md">
                <FileIcon name={file.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {fileError && (
              <p className="text-error text-sm">{fileError}</p>
            )}

            <textarea
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
            />

            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading || !file}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving..." : "Save to vault"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <span className="text-lg">📄</span>;
  return <span className="text-lg">🖼️</span>;
}
