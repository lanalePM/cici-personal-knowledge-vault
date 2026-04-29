"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Invalid email or password."
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push("/vault");
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-[400px] border border-border rounded-xl p-8 text-center">
          <div className="text-2xl font-bold mb-2">Check your email</div>
          <p className="text-text-secondary text-sm">
            We sent a magic link to <strong>{email}</strong>. Click the link in
            the email to log in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-1.5 mb-3">
            <span className="text-4xl text-accent leading-none">✦</span>
            <span className="text-2xl font-bold tracking-tight">Cici</span>
          </div>
          <p className="text-sm text-text-secondary">Welcome back</p>
        </div>

        <div className="border border-border rounded-xl p-8">
          {!magicLinkMode ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              {error && (
                <p className="text-error text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
              >
                {loading ? "Logging in..." : "Log in"}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-bg-primary px-2 text-text-tertiary">
                    or
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMagicLinkMode(true)}
                className="w-full py-2.5 border border-accent text-accent text-sm font-medium rounded-md hover:bg-accent-light transition-colors"
              >
                Log in with magic link
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <p className="text-sm text-text-secondary">
                Enter your email and we will send you a magic link to log in.
              </p>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              {error && (
                <p className="text-error text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send magic link"}
              </button>
              <button
                type="button"
                onClick={() => setMagicLinkMode(false)}
                className="w-full text-sm text-text-secondary hover:text-text-primary"
              >
                Back to password login
              </button>
            </form>
          )}

          <p className="text-center text-sm text-text-secondary mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
