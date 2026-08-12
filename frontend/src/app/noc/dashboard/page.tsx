"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Activity,
  ChevronRight,
  RefreshCw,
  Server as ServerIcon,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IncidentDrawer } from "@/components/shared/IncidentDrawer";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { StatCardSkeleton } from "@/components/ui/EmptyState";
import { SeverityBadge, StatusDot } from "@/components/ui/Badge";
import { api, swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, cn, formatSla, timeAgo } from "@/lib/utils";
import type { Alert, Incident, Paginated, Server, ServerStatus, SlaSummary, Tenant } from "@/types";

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;

/** Stable query window — avoids SWR key churn that remounts the page every few seconds. */
const ALERTS_FROM = new Date(Date.now() - 24 * 3600000).toISOString();

function tenantHealthStatus(
  tenantId: string,
  servers: Server[]
): ServerStatus | "ok" | "warn" | "critical" {
  const tenantServers = servers.filter((s) => s.tenantId === tenantId);
  if (tenantServers.some((s) => s.status === "DOWN")) return "critical";
  if (tenantServers.some((s) => s.status === "WARNING")) return "warn";
  return "ok";
}

export default function NocDashboardPage() {
  const [drawerIncident, setDrawerIncident] = useState<Incident | null>(null);

  const { data: serversPage, isLoading: serversLoading } = useSWR<Paginated<Server>>(
    `/servers${buildQuery({ limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: incidentsPage, mutate: mutateIncidents } = useSWR<Paginated<Incident>>(
    `/incidents${buildQuery({ limit: 50 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    `/tenants${buildQuery({ limit: 100, status: "active" })}`,
    swrFetcher
  );
  const { data: alertsPage } = useSWR<Paginated<Alert>>(
    `/alerts${buildQuery({ limit: 100, from: ALERTS_FROM })}`,
    swrFetcher,
    LIVE_SWR
  );
  const tenants = tenantsPage?.data ?? [];
  const servers = serversPage?.data ?? [];
  const incidents = incidentsPage?.data ?? [];

  const { data: slaSummaries } = useSWR<SlaSummary[]>(
    tenants.length
      ? ["noc-dashboard-sla", CURRENT_YEAR, CURRENT_MONTH, tenants.map((t) => t.id).join(",")]
      : null,
    async () => {
      const results = await Promise.all(
        tenants.map((t) =>
          api
            .get<SlaSummary>(
              `/sla${buildQuery({ tenantId: t.id, year: CURRENT_YEAR, month: CURRENT_MONTH })}`
            )
            .then((r) => r.data)
            .catch(() => null)
        )
      );
      return results.filter((r): r is SlaSummary => r !== null);
    }
  );

  const downCount = servers.filter((s) => s.status === "DOWN").length;
  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED").length;
  const avgSla =
    slaSummaries && slaSummaries.length > 0
      ? slaSummaries.reduce((sum, r) => sum + r.overallUptimePercent, 0) /
        slaSummaries.length
      : 0;

  const openByTenant = useMemo(() => {
    const map = new Map<string, number>();
    incidents
      .filter((i) => i.status !== "RESOLVED")
      .forEach((i) => map.set(i.tenantId, (map.get(i.tenantId) ?? 0) + 1));
    return map;
  }, [incidents]);

  const liveFeed = incidents
    .filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS")
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, 20);

  const chartData = useMemo(() => {
    const alerts = alertsPage?.data ?? [];
    const buckets = new Map<
      string,
      { hour: string; critical: number; warning: number; info: number }
    >();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 3600000);
      const key = d.toISOString().slice(0, 13);
      buckets.set(key, {
        hour: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        critical: 0,
        warning: 0,
        info: 0,
      });
    }
    alerts.forEach((a) => {
      const key = new Date(a.firedAt).toISOString().slice(0, 13);
      const bucket = buckets.get(key);
      if (!bucket) return;
      if (a.severity === "CRITICAL") bucket.critical += 1;
      else if (a.severity === "WARNING") bucket.warning += 1;
      else bucket.info += 1;
    });
    return Array.from(buckets.values());
  }, [alertsPage?.data]);

  async function openDrawer(inc: Incident) {
    try {
      const { data } = await api.get<Incident>(`/incidents/${inc.id}`);
      setDrawerIncident(data);
    } catch {
      setDrawerIncident(inc);
    }
  }

  async function refreshDrawer(id: string) {
    const { data } = await api.get<Incident>(`/incidents/${id}`);
    setDrawerIncident(data);
    await mutateIncidents();
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real-time global view of all client infrastructures"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <RefreshCw className="h-3.5 w-3.5" />
            Auto-updates via WebSocket
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {isInitialLoad(serversLoading, serversPage) ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total servers monitored" value={serversPage?.total ?? servers.length} icon={ServerIcon} />
            <StatCard
              label="Servers DOWN"
              value={downCount}
              icon={ServerIcon}
              accent={downCount > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Open incidents"
              value={openIncidents}
              icon={ShieldAlert}
              accent={openIncidents > 0 ? "warn" : "success"}
            />
            <StatCard
              label="Avg SLA this month"
              value={slaSummaries?.length ? formatSla(avgSla) : "—"}
              icon={TrendingUp}
              hint="all tenants"
              accent={
                !slaSummaries?.length
                  ? "default"
                  : avgSla >= 99.9
                    ? "success"
                    : avgSla >= 99
                      ? "warn"
                      : "danger"
              }
            />
          </>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Tenant health</h2>
        {tenants.length === 0 ? (
          <p className="text-sm text-text-muted">No active tenants.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tenants.map((tenant) => (
              <TenantHealthCard
                key={tenant.id}
                tenant={tenant}
                serverCount={servers.filter((s) => s.tenantId === tenant.id).length}
                openIncidents={openByTenant.get(tenant.id) ?? 0}
                health={tenantHealthStatus(tenant.id, servers)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Live incident feed</h2>
          <div className="rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle">
            {liveFeed.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-muted">
                No open incidents — all systems operational.
              </p>
            ) : (
              liveFeed.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => openDrawer(inc)}
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-overlay/60 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <SeverityBadge severity={inc.severity} />
                    <span className="text-sm font-medium text-text-primary truncate">
                      {inc.tenantName}
                    </span>
                    <span className="text-sm text-text-muted">·</span>
                    <span className="text-sm text-text-secondary truncate">
                      {inc.hostname}
                    </span>
                    <span className="hidden md:inline text-sm text-text-muted truncate">
                      {inc.title}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-text-muted tabular-nums">
                    {timeAgo(inc.openedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Alert rate (24h)</h2>
          <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
            <div className="h-64">
              {(alertsPage?.data?.length ?? 0) === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-text-muted">
                  No alerts in the last 24 hours.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      name="Critical"
                      stroke="var(--status-down)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="warning"
                      name="Warning"
                      stroke="var(--status-warn)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="info"
                      name="Info"
                      stroke="var(--severity-info)"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>
      </div>

      <IncidentDrawer
        incident={drawerIncident}
        open={!!drawerIncident}
        onClose={() => setDrawerIncident(null)}
        onAcknowledge={async () => {
          if (!drawerIncident) return;
          await api.patch(`/incidents/${drawerIncident.id}/acknowledge`);
          await refreshDrawer(drawerIncident.id);
        }}
        onResolve={async () => {
          if (!drawerIncident) return;
          await api.patch(`/incidents/${drawerIncident.id}/resolve`, {});
          await refreshDrawer(drawerIncident.id);
        }}
        onReopen={async () => {
          if (!drawerIncident) return;
          await api.patch(`/incidents/${drawerIncident.id}/reopen`);
          await refreshDrawer(drawerIncident.id);
        }}
        onAddNote={async (content) => {
          if (!drawerIncident) return;
          await api.post(`/incidents/${drawerIncident.id}/notes`, { content });
          await refreshDrawer(drawerIncident.id);
        }}
      />
    </div>
  );
}

function TenantHealthCard({
  tenant,
  serverCount,
  openIncidents,
  health,
}: {
  tenant: Tenant;
  serverCount: number;
  openIncidents: number;
  health: ServerStatus | "ok" | "warn" | "critical";
}) {
  return (
    <Link
      href={`/noc/tenants/${tenant.id}`}
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-raised p-4 transition-colors duration-200 cursor-pointer",
        "hover:border-border-strong hover:bg-surface-overlay/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-text-primary truncate">{tenant.name}</h3>
        <StatusDot status={health} pulse={health === "critical"} />
      </div>
      <div className="mt-4 flex items-center gap-4 text-sm text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ServerIcon className="h-3.5 w-3.5" />
          {serverCount} servers
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" />
          {openIncidents} incidents
        </span>
      </div>
      <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-accent">
        View tenant
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
