"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Check your email</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          If an account exists for <span className="font-medium">{email}</span>, a password reset link has been
          sent.
        </p>
        <Link href="/login" className="btn-secondary mt-6 inline-flex w-full justify-center">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Reset your password</h2>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@kncc.lk" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
