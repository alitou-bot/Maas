"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { cn } from "@/lib/utils";
import { WatchButton } from "@/components/watch/WatchButton";
import type { ServerContainer, ServerContainersResponse } from "@/types";

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes("run")) return "text-status-up";
  if (s.includes("restart")) return "text-status-warn";
  if (s.includes("stop") || s.includes("exit") || s.includes("dead")) {
    return "text-status-down";
  }
  return "text-text-muted";
}

export function ContainersTab({ serverId }: { serverId: string }) {
  const { data, isLoading } = useSWR<ServerContainersResponse>(
    `/servers/${serverId}/containers`,
    swrFetcher,
    TAB_REFRESH
  );

  const columns = useMemo<ColumnDef<ServerContainer, unknown>[]>(
    () => [
      {
        id: "watch",
        header: "",
        cell: ({ row }) => (
          <WatchButton
            serverId={serverId}
            entityType="CONTAINER"
            entityName={row.original.name}
          />
        ),
      },
      { accessorKey: "name", header: "Container name" },
      {
        accessorKey: "image",
        header: "Image",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const status = String(getValue() || "unknown");
          return (
            <span className={cn("capitalize font-medium", statusClass(status))}>
              {status}
            </span>
          );
        },
      },
      {
        accessorKey: "cpuPercent",
        header: "CPU %",
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {(getValue() as number).toFixed(1)}%
          </span>
        ),
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatBytes(row.original.memoryUsed)}
            {row.original.memoryLimit
              ? ` / ${formatBytes(row.original.memoryLimit)}`
              : ""}
          </span>
        ),
      },
      {
        accessorKey: "uptime",
        header: "Uptime",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
    ],
    [serverId]
  );

  if (isLoading && !data) return <TableSkeleton rows={5} />;

  if (data && !data.available) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-raised p-8 text-center">
        <p className="text-sm text-text-secondary">
          Docker monitoring not available for this server
        </p>
        <p className="mt-1 text-xs text-text-muted">
          The Zabbix agent needs access to the Docker socket on this host.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      data={data?.containers ?? []}
      columns={columns}
      searchPlaceholder="Search containers…"
      emptyTitle="Collecting container data…"
    />
  );
}
