"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { KeyRound, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import type { NotificationSettings, Severity, Tenant } from "@/types";

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "CRITICAL", label: "Critical only" },
  { value: "WARNING", label: "Warning and above" },
  { value: "INFO", label: "All severities" },
];

export default function ClientSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "TENANT_ADMIN";

  const { data: tenant } = useSWR<Tenant>(
    user?.tenantId ? `/tenants/${user.tenantId}` : null,
    swrFetcher
  );
  const {
    data: notificationSettings,
    mutate: mutateSettings,
  } = useSWR<NotificationSettings>(
    isAdmin ? "/notifications/settings" : null,
    swrFetcher
  );

  const [settings, setSettings] = useState<NotificationSettings>({
    emailEnabled: true,
    emailRecipients: [],
    slackWebhookUrl: null,
    discordWebhookUrl: null,
    minSeverity: "WARNING",
  });
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (notificationSettings) {
      setSettings(notificationSettings);
    }
  }, [notificationSettings]);

  async function saveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSettingsError("");
    try {
      await api.patch("/notifications/settings", settings);
      await mutateSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSettingsError(apiErrorMessage(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMsg("");
    if (passwordForm.next.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (passwordForm.current === passwordForm.next) {
      setPasswordError("New password must be different from the current password.");
      return;
    }

    setPasswordSaving(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: passwordForm.current,
        newPassword: passwordForm.next,
      });
      setPasswordMsg("Password updated successfully.");
      setPasswordForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPasswordError(apiErrorMessage(err, "Failed to update password"));
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account and organization preferences"
      />

      {isAdmin && (
        <form onSubmit={saveNotifications} className="space-y-8 mb-8">
          <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
            <h2 className="text-lg font-semibold text-text-primary">Company profile</h2>
            <p className="mt-1 text-sm text-text-muted">
              Organization details visible on reports and notifications
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Company name"
                value={tenant?.name ?? user?.tenantName ?? ""}
                readOnly
                className="bg-surface-overlay/50 cursor-not-allowed"
              />
              <Input
                label="Contact email"
                type="email"
                value={tenant?.contactEmail ?? ""}
                readOnly
                className="bg-surface-overlay/50 cursor-not-allowed"
              />
            </div>
          </section>

          <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
            <h2 className="text-lg font-semibold text-text-primary">Notification preferences</h2>
            <p className="mt-1 text-sm text-text-muted">
              Configure how your team receives monitoring alerts
            </p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailEnabled}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, emailEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border-strong accent-accent cursor-pointer"
                />
                <span className="text-sm text-text-primary">Enable email alerts</span>
              </label>
              <Input
                label="Alert email addresses"
                hint="Comma-separated list"
                value={settings.emailRecipients.join(", ")}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    emailRecipients: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }))
                }
              />
              <Input
                label="Slack webhook (optional)"
                value={settings.slackWebhookUrl ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    slackWebhookUrl: e.target.value || null,
                  }))
                }
                placeholder="https://hooks.slack.com/…"
              />
              <Input
                label="Discord webhook (optional)"
                value={settings.discordWebhookUrl ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    discordWebhookUrl: e.target.value || null,
                  }))
                }
                placeholder="https://discord.com/api/webhooks/…"
              />
              <Select
                label="Minimum severity"
                value={settings.minSeverity}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    minSeverity: e.target.value as Severity,
                  }))
                }
                options={SEVERITY_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
          </section>

          {settingsError && <p className="text-sm text-status-down">{settingsError}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {saved && <span className="text-sm text-status-up">Settings saved.</span>}
          </div>
        </form>
      )}

      <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Change password</h2>
        </div>
        <p className="mt-1 text-sm text-text-muted">Update your account password</p>
        <form onSubmit={changePassword} className="mt-4 max-w-md space-y-4">
          <Input
            label="Current password"
            type="password"
            required
            value={passwordForm.current}
            onChange={(e) =>
              setPasswordForm((f) => ({ ...f, current: e.target.value }))
            }
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            required
            value={passwordForm.next}
            onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
            autoComplete="new-password"
            hint="Minimum 8 characters"
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            value={passwordForm.confirm}
            onChange={(e) =>
              setPasswordForm((f) => ({ ...f, confirm: e.target.value }))
            }
            autoComplete="new-password"
          />
          {passwordError && (
            <p className="text-sm text-status-down">{passwordError}</p>
          )}
          {passwordMsg && <p className="text-sm text-status-up">{passwordMsg}</p>}
          <Button type="submit" disabled={passwordSaving}>
            {passwordSaving ? "Updating…" : "Update password"}
          </Button>
        </form>
      </section>
    </div>
  );
}
