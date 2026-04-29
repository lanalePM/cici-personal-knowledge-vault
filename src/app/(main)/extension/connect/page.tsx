"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function ExtensionConnectPage() {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoConnected, setAutoConnected] = useState(false);

  useEffect(() => {
    fetch("/api/extension/token")
      .then((res) => res.json())
      .then((data) => {
        if (data.token) {
          setToken(data.token);
          // Send token to extension via content script
          try {
            window.postMessage(
              { type: "CICI_TOKEN", token: data.token },
              "*"
            );
          } catch {
            // Extension might not be listening
          }
        } else {
          setError("Please log in first.");
        }
      })
      .catch(() => setError("Failed to get token."))
      .finally(() => setLoading(false));

    // Listen for confirmation from content script
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "CICI_TOKEN_STORED") {
        setAutoConnected(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="max-w-md w-full mx-4 p-8 border border-border rounded-xl">
        <div className="text-center mb-6">
          <div className="text-3xl text-accent mb-3">✦</div>
          <h1 className="text-xl font-bold mb-1">Connect Cici me Extension</h1>
          <p className="text-sm text-text-secondary">
            {autoConnected
              ? "Your extension is connected."
              : "If the extension is installed, it will connect automatically. Otherwise, copy the token below."}
          </p>
        </div>

        {loading ? (
          <div className="h-12 bg-bg-secondary rounded-md animate-pulse" />
        ) : error ? (
          <p className="text-error text-sm text-center">{error}</p>
        ) : autoConnected ? (
          <p className="text-sm text-success text-center font-medium">✓ You can close this tab</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 px-3 py-2.5 bg-bg-secondary border border-border rounded-md text-xs font-mono truncate">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="px-3 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-md shrink-0"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-text-tertiary text-center">
              This token expires when your session ends. You can generate a new
              one anytime from the avatar menu.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
