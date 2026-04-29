"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Search, Menu, LogOut, Key, Check, BarChart2 } from "lucide-react";

interface TopBarProps {
  /** Optional — when omitted the hamburger is hidden (e.g. on item-detail pages) */
  onMenuToggle?: () => void;
  onSearch: (query: string) => void;
  searchQuery: string;
}

export default function TopBar({ onMenuToggle, onSearch, searchQuery }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(searchQuery);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [scoutCount, setScoutCount] = useState(0);
  const avatarRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // Keep local query in sync when parent clears it
  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  // Fetch pending scout suggestion count on every navigation
  useEffect(() => {
    fetch("/api/scout/suggestions?status=pending")
      .then((r) => r.json())
      .then((data: { suggestions?: unknown[] }) => {
        if (Array.isArray(data.suggestions)) setScoutCount(data.suggestions.length);
      })
      .catch(() => {});
  }, [pathname]);

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search — fires 300 ms after the user stops typing
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(val), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onSearch(query);
    }
    if (e.key === "Escape") {
      setQuery("");
      onSearch("");
    }
  }

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

  /** Returns Tailwind classes for nav link; highlights the active route */
  function navLinkCls(href: string) {
    const isActive =
      pathname === href || (href !== "/vault" && pathname.startsWith(href));
    return `text-sm font-medium transition-colors hidden sm:inline-flex items-center gap-1 ${
      isActive
        ? "text-accent"
        : "text-text-secondary hover:text-text-primary"
    }`;
  }

  return (
    <header className="h-14 border-b border-border bg-bg-primary flex items-center px-4 gap-4 sticky top-0 z-30">
      {/* Hamburger — only rendered when caller needs a sidebar toggle */}
      {onMenuToggle && (
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Logo + Nav */}
      <div className="flex items-center gap-5 shrink-0">
        <Link href="/vault" className="flex items-center gap-2 hover:opacity-90 group">
          <span className="text-xl text-accent leading-none">✦</span>
          <span className="text-lg font-bold tracking-tight">Cici</span>
        </Link>

        <nav className="flex items-center gap-5">
          <Link href="/ask" className={navLinkCls("/ask")}>
            Ask
          </Link>
          <Link href="/scout" className={navLinkCls("/scout")}>
            Scout
            {scoutCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full leading-none">
                {scoutCount > 99 ? "99+" : scoutCount}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Search */}
      <div className="flex-1 flex justify-center">
        <div className="relative w-full max-w-[480px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="Search… (press / to focus)"
            value={query}
            onChange={handleInputChange}
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

      {/* Avatar / user menu */}
      <div className="relative shrink-0" ref={avatarRef}>
        <button
          onClick={() => setAvatarOpen(!avatarOpen)}
          className="w-8 h-8 rounded-full bg-accent-light text-accent text-sm font-semibold flex items-center justify-center hover:ring-2 hover:ring-accent/30"
        >
          {initial}
        </button>

        {avatarOpen && (
          <div className="absolute right-0 top-10 w-52 bg-bg-primary border border-border rounded-lg shadow-lg py-1 z-50">
            <div className="px-3 py-2 text-xs text-text-tertiary truncate border-b border-border">
              {userEmail}
            </div>

            <button
              onClick={handleCopyToken}
              className="w-full px-3 py-2 text-sm text-left hover:bg-bg-hover flex items-center gap-2"
            >
              {tokenCopied ? (
                <Check size={14} className="text-success" />
              ) : (
                <Key size={14} />
              )}
              {tokenCopied ? "Copied!" : "Copy API Token"}
            </button>

            <Link
              href="/eval"
              onClick={() => setAvatarOpen(false)}
              className="w-full px-3 py-2 text-sm text-left hover:bg-bg-hover flex items-center gap-2 text-text-secondary"
            >
              <BarChart2 size={14} /> Eval Dashboard
            </Link>

            <div className="border-t border-border my-1" />

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
