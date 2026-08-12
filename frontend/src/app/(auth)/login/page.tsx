"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email, password);
    if (!res.ok) {
      setLoading(false);
      setError(res.error || "Sign in failed");
      return;
    }
    // Full navigation so middleware reads the auth cookie reliably
    const next = new URLSearchParams(window.location.search).get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : res.redirect || "/admin/dashboard";
    window.location.assign(dest);
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised/90 p-6 shadow-xl backdrop-blur sm:p-8">
      <h1 className="text-xl font-bold text-text-primary">Sign in</h1>
      <p className="mt-1 text-sm text-text-muted">Access your monitoring workspace</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <div className="relative">
          <Input
            label="Password"
            type={show ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-8 text-text-muted hover:text-text-primary cursor-pointer"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-accent hover:underline cursor-pointer"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        {error && (
          <p className="rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
