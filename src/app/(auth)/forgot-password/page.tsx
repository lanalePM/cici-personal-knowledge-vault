"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      }
    );

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-[400px] border border-border rounded-xl p-8 text-center">
          <div className="text-3xl text-accent mb-3">✦</div>
          <h1 className="text-lg font-semibold mb-2">Check your email</h1>
          <p className="text-sm text-text-secondary">
            We sent a password reset link to <strong>{email}</strong>. Click the
            link in the email to set a new password.
          </p>
          <p className="text-xs text-text-tertiary mt-4">
            Didn&apos;t get it? Check your spam folder or{" "}
            <button
              onClick={() => setSent(false)}
              className="text-accent hover:underline"
            >
              try again
            </button>
            .
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
          <p className="text-sm text-text-secondary">Reset your password</p>
        </div>

        <div className="border border-border rounded-xl p-8">
          <p className="text-sm text-text-secondary mb-4">
            Enter your email and we&apos;ll send you a link to set a new
            password. This also works if you signed up with magic link and want
            to add a password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm bg-bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />

            {error && <p className="text-error text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="text-center text-sm text-text-secondary mt-6">
            <Link href="/login" className="text-accent hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
