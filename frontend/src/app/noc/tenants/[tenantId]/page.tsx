"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, ChevronRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ServerStatusCard } from "@/components/shared/ServerStatusCard";
import { PageHeader } from "@/components/ui/StatCard";
import { PlanBadge, SeverityBadge, SlaDisplay, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { api, swrFetcher } from "@/lib/api";
import { LIVE_SWR } from "@/lib/live";
import { buildQuery, cn, durationBetween, formatDateTime } from "@/lib/utils";
import type { Incident, MetricSeries, Paginated, Server, SlaSummary, Tenant } from "@/types";

type TimeRange = "1h" | "6h" | "24h" | "7d";

const RANGE_HOURS: Record<TimeRange, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
};

const CHART_COLORS = [
  "var(--accent)",
  "var(--status-warn)",
  "var(--status-down)",
  "var(--severity-info)",
  "var(--status-up)",
];

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;

function rangeBounds(hours: number) {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - hours * 3600000).toISOString();
  return { from, to };
}

export default function NocTenantPage() {
  const router = useRouter();
  const params = useParams();
  const tenantId = params.tenantId as string;
  const [range, setRange] = useState<TimeRange>("6h");

  const { data: tenant, isLoading: tenantLoading } = useSWR<Tenant>(
    `/tenants/${tenantId}`,
    swrFetcher
  );
  const { data: serversPage } = useSWR<Paginated<Server>>(
    `/servers${buildQuery({ tenantId, limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: incidentsPage, mutate: mutateIncidents } = useSWR<Paginated<Incident>>(
    `/incidents${buildQuery({ tenantId, limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: slaSummary } = useSWR<SlaSummary>(
    `/sla${buildQuery({ tenantId, year: CURRENT_YEAR, month: CURRENT_MONTH })}`,
    swrFetcher
  );

  const tenantServers = serversPage?.data ?? [];
  const incidents = incidentsPage?.data ?? [];

  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "RESOLVED"),
    [incidents]
  );

  const chartServers = tenantServers.slice(0, 5);
  const hours = RANGE_HOURS[range];

  const { data: metricBundle } = useSWR(
    chartServers.length
      ? [
          "tenant-metrics",
          tenantId,
          range,
          chartServers.map((s) => s.id).join(","),
        ]
      : null,
    async () => {
      const { from, to } = rangeBounds(hours);
      return Promise.all(
        chartServers.map(async (server) => {
          const [cpu, memory, network] = await Promise.all([
            api.get<MetricSeries>(
              `/servers/${server.id}/metrics${buildQuery({ metric: "cpu", from, to })}`
            ),
            api.get<MetricSeries>(
              `/servers/${server.id}/metrics${buildQuery({ metric: "memory", from, to })}`
            ),
            api.get<MetricSeries>(
              `/servers/${server.id}/metrics${buildQuery({ metric: "network", from, to })}`
            ),
          ]);
          return { server, cpu: cpu.data, memory: memory.data, network: network.data };
        })
      );
    },
    { keepPreviousData: true }
  );

  const cpuChartData = useMemo(() => {
    if (!metricBundle?.length) return [];
    const length = metricBundle[0]?.cpu.dataPoints.length ?? 0;
    return Array.from({ length }, (_, i) => {
      const point: Record<string, string | number> = {
        time: metricBundle[0]?.cpu.dataPoints[i]?.timestamp ?? "",
      };
      metricBundle.forEach(({ server, cpu }) => {
        point[server.hostname] = cpu.dataPoints[i]?.value ?? 0;
      });
      return point;
    });
  }, [metricBundle]);

  const memoryChartData = useMemo(() => {
    if (!metricBundle?.length) return [];
    const length = metricBundle[0]?.memory.dataPoints.length ?? 0;
    return Array.from({ length }, (_, i) => {
      const point: Record<string, string | number> = {
        time: metricBundle[0]?.memory.dataPoints[i]?.timestamp ?? "",
      };
      metricBundle.forEach(({ server, memory }) => {
        point[server.hostname] = memory.dataPoints[i]?.value ?? 0;
      });
      return point;
    });
  }, [metricBundle]);

  const networkChartData = useMemo(() => {
    if (!metricBundle?.length) return [];
    const length = metricBundle[0]?.network.dataPoints.length ?? 0;
    return Array.from({ length }, (_, i) => {
      const total =
        metricBundle.reduce(
          (sum, { network }) => sum + (network.dataPoints[i]?.value ?? 0),
          0
        ) / Math.max(metricBundle.length, 1);
      return {
        time: metricBundle[0]?.network.dataPoints[i]?.timestamp ?? "",
        network: Math.round(total),
      };
    });
  }, [metricBundle]);

  const columns = useMemo<ColumnDef<Incident, unknown>[]>(
    () => [
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => <SeverityBadge severity={getValue() as Incident["severity"]} />,
      },
      { accessorKey: "title", header: "Title" },
      { accessorKey: "hostname", header: "Server" },
      {
        accessorKey: "openedAt",
        header: "Started",
        cell: ({ getValue }) => formatDateTime(getValue() as string),
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) => durationBetween(row.original.openedAt, row.original.resolvedAt),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as Incident["status"]} />,
      },
      {
        id: "assign",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          !row.original.assignedToUserId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async (e) => {
                e.stopPropagation();
                await api.patch(`/incidents/${row.original.id}/acknowledge`);
                await mutateIncidents();
              }}
            >
              Assign to me
            </Button>
          ) : (
            <span className="text-xs text-text-muted">{row.original.assignedToName}</span>
          ),
      },
    ],
    [mutateIncidents]
  );

  if (tenantLoading) {
    return <TableSkeleton rows={4} />;
  }

  if (!tenant) {
    return (
      <EmptyState
        icon={Building2}
        title="Tenant not found"
        description="This tenant does not exist or was removed."
        actionLabel="Back to dashboard"
        onAction={() => router.push("/noc/dashboard")}
      />
    );
  }

  return (
    <div>
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-text-muted">
        <Link href="/noc/dashboard" className="hover:text-text-primary transition-colors cursor-pointer">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Tenants</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-text-primary font-medium">{tenant.name}</span>
      </nav>

      <PageHeader title={tenant.name} description="NOC view of tenant infrastructure" />

      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">{tenant.name}</span>
        {tenant.planName && <PlanBadge plan={tenant.planName} />}
        <span className="text-sm text-text-muted">
          {tenantServers.length} server{tenantServers.length !== 1 ? "s" : ""}
        </span>
        {slaSummary && (
          <span className="inline-flex items-center gap-1.5 text-sm">
            SLA:
            <SlaDisplay value={slaSummary.overallUptimePercent} />
          </span>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Server status</h2>
        {tenantServers.length === 0 ? (
          <p className="text-sm text-text-muted">No servers for this tenant.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tenantServers.map((server) => (
              <ServerStatusCard key={server.id} server={server} href="/noc/servers" />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Active incidents</h2>
        <DataTable
          data={activeIncidents}
          columns={columns}
          searchPlaceholder="Search incidents…"
          emptyTitle="No active incidents for this tenant"
        />
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Metrics</h2>
          <div className="flex gap-1 rounded-lg border border-border-subtle bg-surface-raised p-1">
            {(["1h", "6h", "24h", "7d"] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer",
                  range === r
                    ? "bg-accent-muted text-accent"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {chartServers.length === 0 ? (
          <p className="text-sm text-text-muted">No servers available for metrics.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <MetricChart title="CPU usage">
              <LineChart data={cpuChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => formatDateTime(v as string)}
                />
                <Legend />
                {chartServers.map((s, idx) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.hostname}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </MetricChart>

            <MetricChart title="Memory usage">
              <LineChart data={memoryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => formatDateTime(v as string)}
                />
                <Legend />
                {chartServers.map((s, idx) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.hostname}
                    stroke={CHART_COLORS[(idx + 2) % CHART_COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </MetricChart>

            <MetricChart title="Network I/O" className="lg:col-span-2">
              <AreaChart data={networkChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="time"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => formatDateTime(v as string)}
                />
                <Area
                  type="monotone"
                  dataKey="network"
                  name="Network"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </MetricChart>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricChart({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border-subtle bg-surface-raised p-4", className)}>
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
