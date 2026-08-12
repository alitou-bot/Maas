"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, apiErrorMessage } from "@/lib/api";

export default function ChangePasswordPage() {
  const [form, setForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (form.next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (form.next !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.current === form.next) {
      setError("New password must be different from the current password.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: form.current,
        newPassword: form.next,
      });
      setSuccess("Password updated successfully.");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to update password"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Change password"
        description="Choose a strong password you have not used before"
      />

      <section className="max-w-md rounded-xl border border-border-subtle bg-surface-raised p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">
            Update password
          </h2>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Enter your current password, then set a new one.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Input
            label="Current password"
            type="password"
            required
            value={form.current}
            onChange={(e) =>
              setForm((f) => ({ ...f, current: e.target.value }))
            }
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            required
            value={form.next}
            onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
            autoComplete="new-password"
            hint="Minimum 8 characters"
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            value={form.confirm}
            onChange={(e) =>
              setForm((f) => ({ ...f, confirm: e.target.value }))
            }
            autoComplete="new-password"
          />

          {error && <p className="text-sm text-status-down">{error}</p>}
          {success && <p className="text-sm text-status-up">{success}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </Button>
            <Link
              href="/account/profile"
              className="text-sm text-text-muted hover:text-text-primary cursor-pointer"
            >
              Back to profile
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
