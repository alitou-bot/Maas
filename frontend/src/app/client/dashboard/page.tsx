"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Activity,
  BarChart3,
  Server as ServerIcon,
  ShieldAlert,
} from "lucide-react";
import { ServerStatusCard } from "@/components/shared/ServerStatusCard";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { StatCardSkeleton } from "@/components/ui/EmptyState";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";
import { swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime, formatSla } from "@/lib/utils";
import type { Incident, Paginated, Server, SlaSummary } from "@/types";

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();

export default function ClientDashboardPage() {
  const { user } = useAuth();

  const { data: serversPage, isLoading: serversLoading } = useSWR<Paginated<Server>>(
    `/servers${buildQuery({ limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: incidentsPage } = useSWR<Paginated<Incident>>(
    `/incidents${buildQuery({ limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const { data: slaSummary } = useSWR<SlaSummary>(
    `/sla${buildQuery({ year: CURRENT_YEAR, month: CURRENT_MONTH })}`,
    swrFetcher
  );

  const tenantServers = serversPage?.data ?? [];
  const incidents = incidentsPage?.data ?? [];
  const downCount = tenantServers.filter((s) => s.status === "DOWN").length;
  const statusText =
    tenantServers.length === 0
      ? "No servers"
      : downCount === 0
        ? "All systems operational"
        : `${downCount} server${downCount > 1 ? "s" : ""} DOWN`;

  const avgSla = slaSummary?.overallUptimePercent ?? 0;
  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED").length;

  const recentIncidents = useMemo(
    () =>
      [...incidents]
        .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
        .slice(0, 5),
    [incidents]
  );

  const incidentColumns = useMemo<ColumnDef<Incident, unknown>[]>(
    () => [
      { accessorKey: "title", header: "Title" },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => <SeverityBadge severity={getValue() as Incident["severity"]} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as Incident["status"]} />,
      },
      { accessorKey: "hostname", header: "Server" },
      {
        accessorKey: "openedAt",
        header: "Opened",
        cell: ({ getValue }) => formatDateTime(getValue() as string),
      },
    ],
    []
  );

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`Monitoring summary for ${user?.tenantName ?? "your organization"}`}
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
            <StatCard label="Servers monitored" value={tenantServers.length} icon={ServerIcon} />
            <StatCard
              label="Current status"
              value={statusText}
              icon={Activity}
              accent={downCount > 0 ? "danger" : "success"}
            />
            <StatCard
              label="SLA this month"
              value={slaSummary ? formatSla(avgSla) : "—"}
              icon={BarChart3}
              hint="average uptime"
              accent={
                !slaSummary
                  ? "default"
                  : avgSla >= 99.9
                    ? "success"
                    : avgSla >= 99
                      ? "warn"
                      : "danger"
              }
            />
            <StatCard
              label="Open incidents"
              value={openIncidents}
              icon={ShieldAlert}
              accent={openIncidents > 0 ? "warn" : "success"}
            />
          </>
        )}
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">Server status</h2>
          <Link href="/client/servers">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
        {tenantServers.length === 0 ? (
          <p className="text-sm text-text-muted">No servers assigned to your account.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tenantServers.map((server) => (
              <ServerStatusCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">Recent incidents</h2>
          <Link href="/client/incidents">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
        <DataTable
          data={recentIncidents}
          columns={incidentColumns}
          searchPlaceholder="Search incidents…"
          pageSize={5}
          emptyTitle="No incidents"
        />
      </section>
    </div>
  );
}
