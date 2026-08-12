"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { IncidentDrawer } from "@/components/shared/IncidentDrawer";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/StatCard";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { api, swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime } from "@/lib/utils";
import type { Incident, IncidentStatus, Paginated, Severity } from "@/types";

export default function ClientIncidentsPage() {
  const [selected, setSelected] = useState<Incident | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const incidentsKey = `/incidents${buildQuery({
    limit: 100,
    severity: severity !== "all" ? severity : undefined,
    status: status !== "all" ? status : undefined,
    from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
  })}`;
  const { data: incidentsPage, isLoading } = useSWR<Paginated<Incident>>(
    incidentsKey,
    swrFetcher,
    LIVE_SWR
  );

  const filtered = incidentsPage?.data ?? [];

  const columns = useMemo<ColumnDef<Incident, unknown>[]>(
    () => [
      { accessorKey: "title", header: "Title" },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => <SeverityBadge severity={getValue() as Severity} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as IncidentStatus} />,
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

  async function openDrawer(incident: Incident) {
    try {
      const { data } = await api.get<Incident>(`/incidents/${incident.id}`);
      setSelected(data);
    } catch {
      setSelected(incident);
    }
    setDrawerOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Track and review incidents affecting your infrastructure"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          options={[
            { value: "all", label: "All severities" },
            { value: "CRITICAL", label: "Critical" },
            { value: "WARNING", label: "Warning" },
            { value: "INFO", label: "Info" },
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "OPEN", label: "Open" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "RESOLVED", label: "Resolved" },
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

      {isInitialLoad(isLoading, incidentsPage) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Search incidents…"
          onRowClick={openDrawer}
          emptyTitle="No incidents match your filters"
        />
      )}

      <IncidentDrawer
        incident={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        readOnly
      />
    </div>
  );
}
