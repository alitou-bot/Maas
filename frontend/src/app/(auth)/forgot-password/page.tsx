"use client";

import { useState } from "react";
import Link from "next/link";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised/90 p-6 shadow-xl backdrop-blur sm:p-8">
      <h1 className="text-xl font-bold text-text-primary">Forgot password</h1>
      <p className="mt-1 text-sm text-text-muted">
        Enter your email and we&apos;ll send a reset link.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent-muted px-4 py-3 text-sm text-accent">
          Check your email for a reset link
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          {error && <p className="text-sm text-status-down">{error}</p>}
        </form>
      )}

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link href="/login" className="text-accent hover:underline cursor-pointer">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
