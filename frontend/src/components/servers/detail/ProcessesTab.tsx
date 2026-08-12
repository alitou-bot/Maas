"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { WatchButton } from "@/components/watch/WatchButton";
import type { ServerProcess, ServerProcessesResponse } from "@/types";

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

export function ProcessesTab({ serverId }: { serverId: string }) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSWR<ServerProcessesResponse>(
    `/servers/${serverId}/processes`,
    swrFetcher,
    TAB_REFRESH
  );

  const processes = useMemo(() => {
    const list = data?.processes ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [data?.processes, search]);

  const columns = useMemo<ColumnDef<ServerProcess, unknown>[]>(
    () => [
      {
        id: "watch",
        header: "",
        cell: ({ row }) => (
          <WatchButton
            serverId={serverId}
            entityType="PROCESS"
            entityName={row.original.name}
          />
        ),
      },
      { accessorKey: "name", header: "Process name" },
      {
        accessorKey: "instances",
        header: "PID count",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}</span>
        ),
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
        accessorKey: "memoryBytes",
        header: "Memory",
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {formatBytes(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const status = String(getValue());
          return <span className="capitalize">{status}</span>;
        },
      },
    ],
    [serverId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <Input
            label="Search processes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by process name…"
          />
        </div>
        {data && (
          <p className="text-xs text-text-muted">
            Total processes:{" "}
            <span className="tabular-nums text-text-secondary">{data.total}</span>
          </p>
        )}
      </div>
      {isLoading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable
          data={processes}
          columns={columns}
          searchPlaceholder=""
          emptyTitle="No processes found"
        />
      )}
    </div>
  );
}
