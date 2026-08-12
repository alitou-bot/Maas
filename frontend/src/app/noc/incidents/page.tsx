"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { IncidentDrawer } from "@/components/shared/IncidentDrawer";
import { PageHeader } from "@/components/ui/StatCard";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { api, swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, durationBetween, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import type { Incident, IncidentStatus, Paginated, Severity, Tenant } from "@/types";

export default function NocIncidentsPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Incident[]>([]);
  const [drawerIncident, setDrawerIncident] = useState<Incident | null>(null);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    `/tenants${buildQuery({ limit: 100 })}`,
    swrFetcher
  );

  const incidentsKey = `/incidents${buildQuery({
    limit: 100,
    tenantId: tenantFilter !== "all" ? tenantFilter : undefined,
    severity: severityFilter !== "all" ? severityFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    assignedTo: assignedFilter === "me" ? user?.id : undefined,
    from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
  })}`;
  const { data: incidentsPage, isLoading, mutate } = useSWR<Paginated<Incident>>(
    incidentsKey,
    swrFetcher,
    LIVE_SWR
  );

  const tenants = tenantsPage?.data ?? [];
  const incidents = incidentsPage?.data ?? [];

  const filtered = useMemo(() => {
    if (assignedFilter !== "unassigned") return incidents;
    return incidents.filter((i) => !i.assignedToUserId);
  }, [incidents, assignedFilter]);

  const refreshDrawer = useCallback(
    async (id: string) => {
      const { data } = await api.get<Incident>(`/incidents/${id}`);
      setDrawerIncident(data);
      await mutate();
    },
    [mutate]
  );

  const openDrawer = useCallback(async (inc: Incident) => {
    try {
      const { data } = await api.get<Incident>(`/incidents/${inc.id}`);
      setDrawerIncident(data);
    } catch {
      setDrawerIncident(inc);
    }
  }, []);

  const acknowledge = useCallback(
    async (inc: Incident) => {
      await api.patch(`/incidents/${inc.id}/acknowledge`);
      await refreshDrawer(inc.id);
    },
    [refreshDrawer]
  );

  const resolve = useCallback(
    async (inc: Incident) => {
      await api.patch(`/incidents/${inc.id}/resolve`, {});
      await refreshDrawer(inc.id);
    },
    [refreshDrawer]
  );

  const assignToMe = useCallback(
    async (inc: Incident) => {
      await api.patch(`/incidents/${inc.id}/acknowledge`);
      await refreshDrawer(inc.id);
    },
    [refreshDrawer]
  );

  const bulkAssign = () => {
    selected.forEach((inc) => {
      void assignToMe(inc);
    });
    setSelected([]);
  };

  const bulkResolve = () => {
    selected.forEach((inc) => {
      if (inc.status !== "RESOLVED") void resolve(inc);
    });
    setSelected([]);
  };

  const columns = useMemo<ColumnDef<Incident, unknown>[]>(
    () => [
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => <SeverityBadge severity={getValue() as Severity} />,
      },
      { accessorKey: "title", header: "Title" },
      { accessorKey: "tenantName", header: "Tenant" },
      { accessorKey: "hostname", header: "Affected server" },
      {
        accessorKey: "openedAt",
        header: "Opened at",
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
        cell: ({ getValue }) => <StatusBadge status={getValue() as IncidentStatus} />,
      },
      {
        id: "assigned",
        header: "Assigned to",
        cell: ({ row }) => row.original.assignedToName ?? "—",
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => openDrawer(row.original)}>
              View
            </Button>
            {row.original.status === "OPEN" && (
              <Button size="sm" variant="ghost" onClick={() => acknowledge(row.original)}>
                Acknowledge
              </Button>
            )}
            {row.original.status !== "RESOLVED" && (
              <Button size="sm" variant="ghost" onClick={() => resolve(row.original)}>
                Resolve
              </Button>
            )}
          </div>
        ),
      },
    ],
    [acknowledge, openDrawer, resolve]
  );

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Unified incident management across all tenants"
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Select
          label="Tenant"
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
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
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "OPEN", label: "Open" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "RESOLVED", label: "Resolved" },
          ]}
        />
        <Select
          label="Assigned to"
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          options={[
            { value: "all", label: "Anyone" },
            { value: "me", label: "Assigned to me" },
            { value: "unassigned", label: "Unassigned" },
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
          enableSelection
          getRowId={(row) => row.id}
          onSelectionChange={setSelected}
          onRowClick={openDrawer}
          emptyTitle="No incidents found"
          toolbar={
            selected.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={bulkAssign}>
                  Assign selected ({selected.length})
                </Button>
                <Button size="sm" variant="secondary" onClick={bulkResolve}>
                  Resolve selected ({selected.length})
                </Button>
              </div>
            ) : null
          }
        />
      )}

      <IncidentDrawer
        incident={drawerIncident}
        open={!!drawerIncident}
        onClose={() => setDrawerIncident(null)}
        onAcknowledge={() => drawerIncident && acknowledge(drawerIncident)}
        onResolve={() => drawerIncident && resolve(drawerIncident)}
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
