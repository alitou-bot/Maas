"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, apiErrorMessage } from "@/lib/api";
import type { NotificationSettings, Severity } from "@/types";
import { PageHeader } from "@/components/ui/StatCard";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { cn } from "@/lib/utils";

type SystemSettings = Record<string, string>;

const TIMEZONES = [
  { value: "Africa/Casablanca", label: "Africa/Casablanca" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/Paris", label: "Europe/Paris" },
];

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "INFO"];

export default function AdminSettingsPage() {
  const { data: systemSettings, isLoading: systemLoading, mutate: mutateSystem } =
    useSWR<SystemSettings>("/system/settings");
  const { data: notifications, isLoading: notifLoading, mutate: mutateNotif } =
    useSWR<NotificationSettings>("/notifications/settings");
  const { data: zabbixStatus, mutate: mutateZabbix } = useSWR<{
    connected: boolean;
    version?: string;
    url?: string;
  }>("/system/zabbix/status");

  const [settings, setSettings] = useState<SystemSettings>({});
  const [notif, setNotif] = useState<NotificationSettings>({
    emailEnabled: true,
    emailRecipients: [],
    slackWebhookUrl: null,
    discordWebhookUrl: null,
    minSeverity: "WARNING",
  });
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingZabbix, setTestingZabbix] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (systemSettings) setSettings(systemSettings);
  }, [systemSettings]);

  useEffect(() => {
    if (notifications) setNotif(notifications);
  }, [notifications]);

  function flash(section: string) {
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  }

  function setKey(key: string, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function saveSystem(keys: string[]) {
    setError("");
    const patch: SystemSettings = {};
    for (const k of keys) {
      if (settings[k] !== undefined) patch[k] = settings[k];
    }
    try {
      await api.patch("/system/settings", patch);
      await mutateSystem();
      flash("saved");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save settings"));
    }
  }

  async function saveNotifications() {
    setError("");
    try {
      await api.patch("/notifications/settings", notif);
      await mutateNotif();
      flash("notifications");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save notifications"));
    }
  }

  async function sendTestEmail() {
    setTestingEmail(true);
    setError("");
    try {
      await api.post("/notifications/settings/test", { channel: "email" });
    } catch (err) {
      setError(apiErrorMessage(err, "Test email failed"));
    } finally {
      setTestingEmail(false);
    }
  }

  async function testZabbixConnection() {
    setTestingZabbix(true);
    setError("");
    try {
      await api.post("/system/zabbix/test");
      await mutateZabbix();
    } catch (err) {
      setError(apiErrorMessage(err, "Zabbix test failed"));
    } finally {
      setTestingZabbix(false);
    }
  }

  const loading =
    isInitialLoad(systemLoading, systemSettings) ||
    isInitialLoad(notifLoading, notifications);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="System settings"
          description="Platform-level configuration and integrations"
        />
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="System settings"
        description="Platform-level configuration and integrations"
      />

      {error && <p className="mb-4 text-sm text-status-down">{error}</p>}

      <div className="space-y-8 max-w-2xl">
        <section className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">General</h2>
          <Input
            label="Platform name"
            value={settings.platformName ?? ""}
            onChange={(e) => setKey("platformName", e.target.value)}
          />
          <Input
            label="Support email"
            type="email"
            value={settings.supportEmail ?? ""}
            onChange={(e) => setKey("supportEmail", e.target.value)}
          />
          <Select
            label="Default timezone"
            value={settings.defaultTimezone ?? "UTC"}
            onChange={(e) => setKey("defaultTimezone", e.target.value)}
            options={TIMEZONES}
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                void saveSystem(["platformName", "supportEmail", "defaultTimezone"])
              }
            >
              Save
            </Button>
            {saved === "saved" && (
              <span className="text-sm text-status-up">Saved</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notif.emailEnabled}
              onChange={(e) =>
                setNotif({ ...notif, emailEnabled: e.target.checked })
              }
              className="h-4 w-4 rounded border-border-strong accent-accent cursor-pointer"
            />
            <span className="text-sm text-text-primary">Enable email notifications</span>
          </label>
          <Input
            label="Email recipients"
            hint="Comma-separated"
            value={notif.emailRecipients.join(", ")}
            onChange={(e) =>
              setNotif({
                ...notif,
                emailRecipients: e.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
          <Input
            label="Slack webhook URL"
            value={notif.slackWebhookUrl ?? ""}
            onChange={(e) =>
              setNotif({
                ...notif,
                slackWebhookUrl: e.target.value || null,
              })
            }
          />
          <Input
            label="Discord webhook URL"
            value={notif.discordWebhookUrl ?? ""}
            onChange={(e) =>
              setNotif({
                ...notif,
                discordWebhookUrl: e.target.value || null,
              })
            }
          />
          <Select
            label="Minimum severity"
            value={notif.minSeverity}
            onChange={(e) =>
              setNotif({ ...notif, minSeverity: e.target.value as Severity })
            }
            options={SEVERITIES.map((s) => ({ value: s, label: s }))}
          />
          <Button variant="outline" onClick={() => void sendTestEmail()} disabled={testingEmail}>
            {testingEmail ? "Sending…" : "Send test email"}
          </Button>
          <div className="flex items-center gap-3">
            <Button onClick={() => void saveNotifications()}>Save</Button>
            {saved === "notifications" && (
              <span className="text-sm text-status-up">Saved</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Zabbix</h2>
          <Input
            label="Zabbix URL"
            value={settings.zabbixUrl ?? ""}
            onChange={(e) => setKey("zabbixUrl", e.target.value)}
          />
          <Input
            label="Zabbix API user"
            value={settings.zabbixApiUser ?? ""}
            onChange={(e) => setKey("zabbixApiUser", e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <StatusDot
              status={zabbixStatus?.connected ? "ok" : "critical"}
              pulse={!zabbixStatus?.connected}
            />
            <span
              className={cn(
                "text-sm font-medium",
                zabbixStatus?.connected ? "text-status-up" : "text-status-down"
              )}
            >
              {zabbixStatus?.connected ? "Connected" : "Disconnected"}
            </span>
            <Button
              variant="outline"
              onClick={() => void testZabbixConnection()}
              disabled={testingZabbix}
            >
              {testingZabbix ? "Testing…" : "Test connection"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void saveSystem(["zabbixUrl", "zabbixApiUser"])}
            >
              Save
            </Button>
            {saved === "saved" && (
              <span className="text-sm text-status-up">Saved</span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Security</h2>
          <Input
            label="JWT expiry (hours)"
            type="number"
            min={1}
            value={settings.jwtExpiryHours ?? ""}
            onChange={(e) => setKey("jwtExpiryHours", e.target.value)}
          />
          <Input
            label="Max login attempts"
            type="number"
            min={1}
            value={settings.maxLoginAttempts ?? ""}
            onChange={(e) => setKey("maxLoginAttempts", e.target.value)}
          />
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay/40 px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-text-primary">
                Force 2FA for admin roles
              </p>
              <p className="text-xs text-text-muted">
                Require two-factor authentication for SUPER_ADMIN and NOC_OPERATOR
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.force2faAdmin === "true"}
              onChange={(e) =>
                setKey("force2faAdmin", e.target.checked ? "true" : "false")
              }
              className="h-5 w-5 rounded border-border-strong accent-accent cursor-pointer"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                void saveSystem([
                  "jwtExpiryHours",
                  "maxLoginAttempts",
                  "force2faAdmin",
                ])
              }
            >
              Save
            </Button>
            {saved === "saved" && (
              <span className="text-sm text-status-up">Saved</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
