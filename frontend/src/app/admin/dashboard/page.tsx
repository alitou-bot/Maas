"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Server as ServerIcon, ShieldAlert, Activity } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { PlanBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { formatDateTime } from "@/lib/utils";
import { LIVE_SWR } from "@/lib/live";
import type { AuditLog, Incident, Paginated, Server, Tenant } from "@/types";

type TenantRow = Tenant & { planName: string | null };

export default function AdminDashboardPage() {
  const { data: tenantsPage, isLoading: tenantsLoading } = useSWR<Paginated<TenantRow>>(
    "/tenants?limit=100"
  );
  const { data: serversPage, isLoading: serversLoading } = useSWR<Paginated<Server>>(
    "/servers?limit=1",
    LIVE_SWR
  );
  const { data: openIncidentsPage, isLoading: openLoading } = useSWR<Paginated<Incident>>(
    "/incidents?status=OPEN&limit=1",
    LIVE_SWR
  );
  const { data: inProgressPage, isLoading: inProgressLoading } = useSWR<Paginated<Incident>>(
    "/incidents?status=IN_PROGRESS&limit=1",
    LIVE_SWR
  );
  const { data: serversAll } = useSWR<Paginated<Server>>(
    "/servers?limit=100",
    LIVE_SWR
  );
  const { data: incidentsAll } = useSWR<Paginated<Incident>>(
    "/incidents?status=OPEN&limit=100",
    LIVE_SWR
  );
  const { data: incidentsInProgress } = useSWR<Paginated<Incident>>(
    "/incidents?status=IN_PROGRESS&limit=100",
    LIVE_SWR
  );
  const { data: auditPage, isLoading: auditLoading } = useSWR<Paginated<AuditLog>>(
    "/audit?limit=10"
  );

  const tenants = tenantsPage?.data ?? [];
  const servers = serversAll?.data ?? [];
  const activeIncidents =
    (openIncidentsPage?.total ?? 0) + (inProgressPage?.total ?? 0);
  const totalServers = serversPage?.total ?? 0;
  const recentEvents = auditPage?.data ?? [];

  const activeByTenant = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of [...(incidentsAll?.data ?? []), ...(incidentsInProgress?.data ?? [])]) {
      map.set(i.tenantId, (map.get(i.tenantId) ?? 0) + 1);
    }
    return map;
  }, [incidentsAll, incidentsInProgress]);

  const serversByTenant = useMemo(() => {
    const map = new Map<string, Server[]>();
    for (const s of servers) {
      const list = map.get(s.tenantId) ?? [];
      list.push(s);
      map.set(s.tenantId, list);
    }
    return map;
  }, [servers]);

  const columns = useMemo<ColumnDef<TenantRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tenant name",
        cell: ({ row }) => (
          <Link
            href={`/admin/tenants/${row.original.id}`}
            className="font-medium text-accent hover:underline cursor-pointer"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "planName",
        header: "Plan",
        cell: ({ row }) => (
          <PlanBadge plan={row.original.planName ?? "—"} />
        ),
      },
      {
        id: "servers",
        header: "Servers",
        cell: ({ row }) =>
          `${row.original.serversUsed} / ${row.original.serverLimit}`,
      },
      {
        id: "incidents",
        header: "Active incidents",
        cell: ({ row }) => activeByTenant.get(row.original.id) ?? 0,
      },
      {
        id: "lastAlert",
        header: "Last alert",
        cell: ({ row }) => {
          const tenantServers = serversByTenant.get(row.original.id) ?? [];
          const down = tenantServers.find((s) => s.status === "DOWN");
          return down?.lastCheck ? formatDateTime(down.lastCheck) : "—";
        },
      },
      {
        id: "health",
        header: "Status",
        cell: ({ row }) => {
          const tenantServers = serversByTenant.get(row.original.id) ?? [];
          const hasDown = tenantServers.some((s) => s.status === "DOWN");
          return hasDown ? (
            <StatusBadge status="DOWN" />
          ) : tenantServers.length > 0 ? (
            <StatusBadge status="UP" />
          ) : (
            <StatusBadge status="UNKNOWN" />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Link href={`/admin/tenants/${row.original.id}`}>
              <Button size="sm" variant="ghost">
                View
              </Button>
            </Link>
            <Link href={`/admin/tenants/${row.original.id}?tab=settings`}>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [activeByTenant, serversByTenant]
  );

  const kpisLoading =
    isInitialLoad(tenantsLoading, tenantsPage) ||
    isInitialLoad(serversLoading, serversPage) ||
    isInitialLoad(openLoading, openIncidentsPage) ||
    isInitialLoad(inProgressLoading, inProgressPage);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Global platform health at a glance"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {kpisLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total tenants"
              value={tenantsPage?.total ?? 0}
              icon={Building2}
            />
            <StatCard label="Monitored servers" value={totalServers} icon={ServerIcon} />
            <StatCard
              label="Active incidents"
              value={activeIncidents}
              icon={ShieldAlert}
              accent={activeIncidents > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Platform uptime"
              value="—"
              icon={Activity}
              hint="compute later"
            />
          </>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Tenant status</h2>
        {isInitialLoad(tenantsLoading, tenantsPage) ? (
          <TableSkeleton rows={5} />
        ) : (
          <DataTable
            data={tenants}
            columns={columns}
            searchPlaceholder="Search tenants…"
            emptyTitle="No tenants yet"
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Recent platform events
        </h2>
        {isInitialLoad(auditLoading, auditPage) ? (
          <TableSkeleton rows={5} />
        ) : recentEvents.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">
            No audit events recorded yet
          </div>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface-raised divide-y divide-border-subtle">
            {recentEvents.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{e.action}</p>
                  <p className="text-xs text-text-muted">by {e.actorEmail}</p>
                </div>
                <p className="text-xs text-text-muted tabular-nums">
                  {formatDateTime(
                    e.createdAt ??
                      (e as AuditLog & { timestamp?: string }).timestamp ??
                      ""
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
