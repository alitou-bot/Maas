"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, MiniBar } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AddServerDrawer, type InstallScriptReady } from "@/components/servers/AddServerDrawer";
import { InstallScriptModal } from "@/components/servers/InstallScriptModal";
import { EditServerDrawer } from "@/components/servers/EditServerDrawer";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime } from "@/lib/utils";
import type {
  Paginated,
  Server,
  ServerGroup,
  ServerStatus,
  Tenant,
} from "@/types";

export default function NocServersPage() {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [installModal, setInstallModal] = useState<InstallScriptReady | null>(null);
  const [editTarget, setEditTarget] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");

  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    `/tenants${buildQuery({ limit: 100 })}`,
    swrFetcher
  );
  const { data: groups } = useSWR<ServerGroup[]>("/groups", swrFetcher);

  const serversKey = `/servers${buildQuery({
    limit: 100,
    tenantId: tenantFilter !== "all" ? tenantFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    groupId: groupFilter !== "all" ? groupFilter : undefined,
  })}`;
  const {
    data: serversPage,
    isLoading,
    mutate,
  } = useSWR<Paginated<Server>>(serversKey, swrFetcher, LIVE_SWR);

  const tenants = tenantsPage?.data ?? [];
  const servers = serversPage?.data ?? [];

  const canManage =
    user?.role === "SUPER_ADMIN" || user?.role === "TENANT_ADMIN";

  const osOptions = useMemo(
    () => [...new Set(servers.map((s) => s.os))].sort(),
    [servers]
  );

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      if (osFilter !== "all" && s.os !== osFilter) return false;
      return true;
    });
  }, [servers, osFilter]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError("");
    try {
      await api.delete(`/servers/${deleteTarget.id}`);
      setDeleteTarget(null);
      void mutate();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to delete server"));
    } finally {
      setDeleting(false);
    }
  }

  const columns = useMemo<ColumnDef<Server, unknown>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Hostname",
        cell: ({ getValue }) => (
          <span className="font-medium text-text-primary">
            {getValue() as string}
          </span>
        ),
      },
      { accessorKey: "ipAddress", header: "IP address" },
      { accessorKey: "tenantName", header: "Tenant" },
      { accessorKey: "os", header: "OS" },
      { accessorKey: "groupName", header: "Group" },
      {
        accessorKey: "cpuPercent",
        header: "CPU %",
        cell: ({ row }) => <MiniBar value={row.original.cpuPercent} />,
      },
      {
        accessorKey: "memPercent",
        header: "RAM %",
        cell: ({ row }) => <MiniBar value={row.original.memPercent} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as ServerStatus} />
        ),
      },
      {
        accessorKey: "lastCheck",
        header: "Last check",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? formatDateTime(v) : "—";
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link
              href={`/noc/servers/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="ghost">
                View
              </Button>
            </Link>
            {canManage && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionError("");
                    setEditTarget(row.original);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionError("");
                    setDeleteTarget(row.original);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canManage]
  );

  return (
    <div>
      <PageHeader
        title="Servers"
        description="Flat list of all servers across all tenants"
        actions={
          canManage ? (
            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4" />
              Add server
            </Button>
          ) : undefined
        }
      />

      {actionError && (
        <p className="mb-4 text-sm text-status-down">{actionError}</p>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "UP", label: "UP" },
            { value: "DOWN", label: "DOWN" },
            { value: "WARNING", label: "WARNING" },
            { value: "UNKNOWN", label: "UNKNOWN" },
          ]}
        />
        <Select
          label="OS"
          value={osFilter}
          onChange={(e) => setOsFilter(e.target.value)}
          options={[
            { value: "all", label: "All OS" },
            ...osOptions.map((os) => ({ value: os, label: os })),
          ]}
        />
        <Select
          label="Group"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          options={[
            { value: "all", label: "All groups" },
            ...(groups ?? []).map((g) => ({ value: g.id, label: g.name })),
          ]}
        />
      </div>

      {isInitialLoad(isLoading, serversPage) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Search servers…"
          emptyTitle="No servers found"
        />
      )}

      <AddServerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onScriptReady={(result) => {
          setDrawerOpen(false);
          setInstallModal(result);
        }}
      />

      {installModal && (
        <InstallScriptModal
          serverId={installModal.serverId}
          installCommand={installModal.installCommand}
          installToken={installModal.installToken}
          os={installModal.os}
          onClose={() => setInstallModal(null)}
          onConnected={() => {
            void mutate();
          }}
          serverDetailBase="/noc/servers"
        />
      )}

      <EditServerDrawer
        open={!!editTarget}
        server={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          void mutate();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete server"
        description={`Delete ${deleteTarget?.hostname ?? "this server"}? This removes it from MAAS and Zabbix.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
