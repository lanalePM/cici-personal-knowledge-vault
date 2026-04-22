"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, Menu, LogOut, Key, Check } from "lucide-react";

interface TopBarProps {
  onMenuToggle: () => void;
  onSearch: (query: string) => void;
  searchQuery: string;
}

export default function TopBar({
  onMenuToggle,
  onSearch,
  searchQuery,
}: TopBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(searchQuery);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      onSearch(query);
    }
    if (e.key === "Escape") {
      setQuery("");
      onSearch("");
    }
  }

  const [tokenCopied, setTokenCopied] = useState(false);

  async function handleCopyToken() {
    try {
      const res = await fetch("/api/extension/token");
      const data = await res.json();
      if (data.token) {
        await navigator.clipboard.writeText(data.token);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initial = userEmail ? userEmail[0].toUpperCase() : "?";

  return (
    <header className="h-14 border-b border-border bg-bg-primary flex items-center px-4 gap-4 sticky top-0 z-30">
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-2 font-bold text-lg shrink-0">
        <span className="text-accent">✦</span>
        <span>Cici</span>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-[480px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="Search your vault..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-8 py-2 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                onSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="relative shrink-0" ref={avatarRef}>
        <button
          onClick={() => setAvatarOpen(!avatarOpen)}
          className="w-8 h-8 rounded-full bg-accent-light text-accent text-sm font-semibold flex items-center justify-center hover:ring-2 hover:ring-accent/30"
        >
          {initial}
        </button>

        {avatarOpen && (
          <div className="absolute right-0 top-10 w-48 bg-bg-primary border border-border rounded-lg shadow-lg py-1 z-50">
            <div className="px-3 py-2 text-xs text-text-tertiary truncate border-b border-border">
              {userEmail}
            </div>
            <button
              onClick={handleCopyToken}
              className="w-full px-3 py-2 text-sm text-left hover:bg-bg-hover flex items-center gap-2"
            >
              {tokenCopied ? <Check size={14} className="text-success" /> : <Key size={14} />}
              {tokenCopied ? "Copied!" : "Copy API Token"}
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-sm text-left hover:bg-bg-hover flex items-center gap-2 text-error"
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
