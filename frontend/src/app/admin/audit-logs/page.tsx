"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import type { AuditLog, Paginated, Tenant, User } from "@/types";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { formatDateTime } from "@/lib/utils";

function auditCreatedAt(log: AuditLog & { timestamp?: string }) {
  return log.createdAt ?? log.timestamp ?? "";
}

function downloadCsv(rows: AuditLog[]) {
  const header =
    "Timestamp,Actor Email,Action,Resource Type,Tenant ID,IP Address,Result";
  const body = rows
    .map((r) =>
      [
        auditCreatedAt(r),
        r.actorEmail,
        `"${r.action.replace(/"/g, '""')}"`,
        r.resourceType,
        r.tenantId ?? "",
        r.ipAddress ?? "",
        r.result,
      ].join(",")
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAuditLogsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [tenantId, setTenantId] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "500" });
    if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
    if (actorId) params.set("actorId", actorId);
    if (action) params.set("action", action);
    if (tenantId) params.set("tenantId", tenantId);
    return `/audit?${params.toString()}`;
  }, [dateFrom, dateTo, actorId, action, tenantId]);

  const { data, isLoading } = useSWR<Paginated<AuditLog>>(query);
  const { data: tenantsPage } = useSWR<Paginated<Tenant>>("/tenants?limit=100");
  const { data: usersPage } = useSWR<Paginated<User>>("/users?limit=100");

  const logs = data?.data ?? [];
  const tenants = tenantsPage?.data ?? [];
  const users = usersPage?.data ?? [];

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        accessorFn: (r) => auditCreatedAt(r),
        cell: ({ row }) => formatDateTime(auditCreatedAt(row.original)),
      },
      {
        id: "actor",
        header: "Actor",
        accessorKey: "actorEmail",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-text-primary">{row.original.actorEmail}</p>
            {row.original.actorId && (
              <p className="text-xs text-text-muted">{row.original.actorId}</p>
            )}
          </div>
        ),
      },
      { accessorKey: "action", header: "Action" },
      {
        accessorKey: "resourceType",
        header: "Resource",
      },
      {
        id: "tenant",
        header: "Tenant affected",
        accessorFn: (r) => {
          if (!r.tenantId) return "—";
          const t = tenants.find((x) => x.id === r.tenantId);
          return t?.name ?? r.tenantId;
        },
      },
      {
        accessorKey: "ipAddress",
        header: "IP address",
        cell: ({ getValue }) => (getValue() as string | null) ?? "—",
      },
      {
        accessorKey: "result",
        header: "Result",
        cell: ({ getValue }) => {
          const result = String(getValue());
          const ok =
            result.toLowerCase() === "success" ||
            result.toLowerCase() === "ok";
          return (
            <StatusBadge status={ok ? "active" : "DOWN"} />
          );
        },
      },
    ],
    [tenants]
  );

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        label="From"
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className="w-36"
      />
      <Input
        label="To"
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className="w-36"
      />
      <Select
        label="Actor"
        value={actorId}
        onChange={(e) => setActorId(e.target.value)}
        options={[
          { value: "", label: "All actors" },
          ...users.map((u) => ({
            value: u.id,
            label: `${u.firstName} ${u.lastName} (${u.email})`,
          })),
        ]}
        className="min-w-[220px]"
      />
      <Input
        label="Action"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        placeholder="Filter by action…"
        className="min-w-[160px]"
      />
      <Select
        label="Tenant"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        options={[
          { value: "", label: "All tenants" },
          ...tenants.map((t) => ({ value: t.id, label: t.name })),
        ]}
        className="min-w-[160px]"
      />
      <Button variant="outline" onClick={() => downloadCsv(logs)} disabled={!logs.length}>
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Full audit trail of all admin actions"
      />

      <div className="mb-4">{filters}</div>

      {isInitialLoad(isLoading, data) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={logs}
          columns={columns}
          searchPlaceholder="Search audit logs…"
          emptyTitle="No audit entries match your filters"
        />
      )}
    </div>
  );
}
