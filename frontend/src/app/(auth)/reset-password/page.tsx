"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/EmptyState";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        newPassword: password,
      });
      router.push("/login");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Reset failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised/90 p-6 shadow-xl backdrop-blur sm:p-8">
      <h1 className="text-xl font-bold text-text-primary">Reset password</h1>
      <p className="mt-1 text-sm text-text-muted">Choose a new password for your account.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirm password"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Resetting…" : "Reset password"}
        </Button>
        {error && (
          <p className="rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down">
            {error}
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        <Link href="/login" className="text-accent hover:underline cursor-pointer">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full max-w-md rounded-2xl" />}>
      <ResetForm />
    </Suspense>
  );
}
