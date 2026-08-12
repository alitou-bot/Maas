"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RoleBadge } from "@/components/ui/Badge";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage } from "@/lib/api";
import { formatDateTime, roleLabel } from "@/lib/utils";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ firstName: "", lastName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (user) {
      setForm({ firstName: user.firstName, lastName: user.lastName });
    }
  }, [user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/users/${user.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });
      await refresh();
      setSuccess("Profile updated.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const dirty =
    form.firstName.trim() !== user.firstName ||
    form.lastName.trim() !== user.lastName;

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your account details across the MAAS platform"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">
              Personal information
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              required
              value={form.firstName}
              onChange={(e) =>
                setForm((f) => ({ ...f, firstName: e.target.value }))
              }
              autoComplete="given-name"
            />
            <Input
              label="Last name"
              required
              value={form.lastName}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastName: e.target.value }))
              }
              autoComplete="family-name"
            />
          </div>

          <Input
            label="Email"
            type="email"
            value={user.email}
            readOnly
            hint="Contact a platform admin to change your email"
            className="bg-surface-overlay/50 cursor-not-allowed"
          />

          {error && <p className="text-sm text-status-down">{error}</p>}
          {success && <p className="text-sm text-status-up">{success}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={saving || !dirty}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Link
              href="/account/password"
              className="text-sm text-accent hover:underline cursor-pointer"
            >
              Change password →
            </Link>
          </div>
        </form>

        <aside className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4 h-fit">
          <h2 className="text-sm font-semibold text-text-primary">
            Account summary
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-text-muted">Role</dt>
              <dd className="mt-1">
                <RoleBadge role={user.role} />
                <span className="sr-only">{roleLabel(user.role)}</span>
              </dd>
            </div>
            {user.tenantName && (
              <div>
                <dt className="text-text-muted">Tenant</dt>
                <dd className="mt-1 text-text-primary">{user.tenantName}</dd>
              </div>
            )}
            {user.status && (
              <div>
                <dt className="text-text-muted">Status</dt>
                <dd className="mt-1 capitalize text-text-primary">{user.status}</dd>
              </div>
            )}
            {user.lastLogin && (
              <div>
                <dt className="text-text-muted">Last login</dt>
                <dd className="mt-1 text-text-primary">
                  {formatDateTime(user.lastLogin)}
                </dd>
              </div>
            )}
            {user.createdAt && (
              <div>
                <dt className="text-text-muted">Member since</dt>
                <dd className="mt-1 text-text-primary">
                  {formatDateTime(user.createdAt)}
                </dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </div>
  );
}
