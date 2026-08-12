"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/StatCard";
import { SeverityBadge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime, formatDurationSeconds } from "@/lib/utils";
import type { Alert, Paginated, Server, Severity, Tenant } from "@/types";

const DEFAULT_ALERTS_FROM = new Date(Date.now() - 24 * 3600000).toISOString();

export default function NocAlertsPage() {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [serverFilter, setServerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    `/tenants${buildQuery({ limit: 100 })}`,
    swrFetcher
  );
  const { data: serversPage } = useSWR<Paginated<Server>>(
    `/servers${buildQuery({ limit: 100, tenantId: tenantFilter !== "all" ? tenantFilter : undefined })}`,
    swrFetcher,
    LIVE_SWR
  );

  const alertsKey = `/alerts${buildQuery({
    limit: 100,
    tenantId: tenantFilter !== "all" ? tenantFilter : undefined,
    severity: severityFilter !== "all" ? severityFilter : undefined,
    serverId: serverFilter !== "all" ? serverFilter : undefined,
    from: dateFrom
      ? new Date(dateFrom).toISOString()
      : DEFAULT_ALERTS_FROM,
    to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
  })}`;
  const { data: alertsPage, isLoading } = useSWR<Paginated<Alert>>(
    alertsKey,
    swrFetcher,
    LIVE_SWR
  );

  const tenants = tenantsPage?.data ?? [];
  const servers = serversPage?.data ?? [];
  const alerts = alertsPage?.data ?? [];

  const columns = useMemo<ColumnDef<Alert, unknown>[]>(
    () => [
      {
        accessorKey: "firedAt",
        header: "Timestamp",
        cell: ({ getValue }) => formatDateTime(getValue() as string),
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => <SeverityBadge severity={getValue() as Severity} />,
      },
      { accessorKey: "tenantName", header: "Tenant" },
      { accessorKey: "hostname", header: "Server" },
      { accessorKey: "message", header: "Alert message" },
      {
        accessorKey: "durationSeconds",
        header: "Duration",
        cell: ({ getValue }) => formatDurationSeconds(getValue() as number),
      },
      {
        id: "incident",
        header: "Linked incident",
        cell: ({ row }) =>
          row.original.linkedIncidentId ? (
            <Link
              href="/noc/incidents"
              className="text-accent hover:underline cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.linkedIncidentId}
            </Link>
          ) : (
            "—"
          ),
      },
    ],
    []
  );

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Raw alert history from Zabbix across all tenants"
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Select
          label="Tenant"
          value={tenantFilter}
          onChange={(e) => {
            setTenantFilter(e.target.value);
            setServerFilter("all");
          }}
          options={[
            { value: "all", label: "All tenants" },
            ...tenants.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          label="Severity"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          options={[
            { value: "all", label: "All severities" },
            { value: "CRITICAL", label: "Critical" },
            { value: "WARNING", label: "Warning" },
            { value: "INFO", label: "Info" },
          ]}
        />
        <Select
          label="Server"
          value={serverFilter}
          onChange={(e) => setServerFilter(e.target.value)}
          options={[
            { value: "all", label: "All servers" },
            ...servers.map((s) => ({ value: s.id, label: s.hostname })),
          ]}
        />
        <Input
          label="From date"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          label="To date"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      {isInitialLoad(isLoading, alertsPage) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={alerts}
          columns={columns}
          searchPlaceholder="Search alerts…"
          emptyTitle="No alerts found"
        />
      )}
    </div>
  );
}
