"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { PageHeader, MiniBar } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AddServerDrawer, type InstallScriptReady } from "@/components/servers/AddServerDrawer";
import { InstallScriptModal } from "@/components/servers/InstallScriptModal";
import { EditServerDrawer } from "@/components/servers/EditServerDrawer";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime, formatUptime } from "@/lib/utils";
import type { Paginated, Server } from "@/types";

export default function ClientServersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [installModal, setInstallModal] = useState<InstallScriptReady | null>(null);
  const [editTarget, setEditTarget] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  const { data: serversPage, isLoading, mutate } = useSWR<Paginated<Server>>(
    `/servers${buildQuery({ limit: 100 })}`,
    swrFetcher,
    LIVE_SWR
  );
  const tenantServers = serversPage?.data ?? [];
  const canManage = user?.role === "TENANT_ADMIN";

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
        cell: ({ row }) => (
          <span className="font-medium text-text-primary">
            {row.original.hostname}
          </span>
        ),
      },
      { accessorKey: "ipAddress", header: "IP address" },
      { accessorKey: "groupName", header: "Group" },
      { accessorKey: "os", header: "OS" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as Server["status"]} />
        ),
      },
      {
        id: "cpu",
        header: "CPU",
        accessorFn: (r) => r.cpuPercent,
        cell: ({ row }) => <MiniBar value={row.original.cpuPercent} />,
      },
      {
        id: "ram",
        header: "RAM",
        accessorFn: (r) => r.memPercent,
        cell: ({ row }) => <MiniBar value={row.original.memPercent} />,
      },
      {
        accessorKey: "uptime",
        header: "Uptime",
        cell: ({ getValue }) => formatUptime(getValue() as string | number),
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
              href={`/client/servers/${row.original.id}`}
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
        title="My servers"
        description={`${tenantServers.length} server${tenantServers.length !== 1 ? "s" : ""} in your monitoring scope`}
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

      {isInitialLoad(isLoading, serversPage) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={tenantServers}
          columns={columns}
          searchPlaceholder="Search servers…"
          onRowClick={(row) => router.push(`/client/servers/${row.id}`)}
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
          serverDetailBase="/client/servers"
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
