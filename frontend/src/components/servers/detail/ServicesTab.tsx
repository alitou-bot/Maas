"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { StatusDot } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { timeAgo } from "@/lib/utils";
import { WatchButton } from "@/components/watch/WatchButton";
import type { ServerService, ServerServicesResponse } from "@/types";

export function ServicesTab({ serverId }: { serverId: string }) {
  const { data, isLoading } = useSWR<ServerServicesResponse>(
    `/servers/${serverId}/services`,
    swrFetcher,
    TAB_REFRESH
  );

  const services = data?.services ?? [];

  const columns = useMemo<ColumnDef<ServerService, unknown>[]>(
    () => [
      {
        id: "watch",
        header: "",
        cell: ({ row }) => (
          <WatchButton
            serverId={serverId}
            entityType="SERVICE"
            entityName={row.original.name}
            entityMeta={{ port: row.original.port }}
          />
        ),
      },
      { accessorKey: "name", header: "Service name" },
      {
        accessorKey: "port",
        header: "Port",
        cell: ({ getValue }) => {
          const port = getValue() as number;
          return port > 0 ? (
            <span className="tabular-nums">{port}</span>
          ) : (
            "—"
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const status = getValue() as ServerService["status"];
          const mapped =
            status === "UP" ? "UP" : status === "DOWN" ? "DOWN" : "UNKNOWN";
          return (
            <span className="inline-flex items-center gap-2">
              <StatusDot status={mapped} />
              {status}
            </span>
          );
        },
      },
      {
        accessorKey: "responseTimeMs",
        header: "Response time",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v == null ? "—" : <span className="tabular-nums">{v} ms</span>;
        },
      },
      {
        accessorKey: "lastChecked",
        header: "Last checked",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? timeAgo(v) : "—";
        },
      },
    ],
    [serverId]
  );

  if (isLoading && !data) return <TableSkeleton rows={6} />;

  return (
    <DataTable
      data={services}
      columns={columns}
      searchPlaceholder="Search services…"
      emptyTitle="No services found"
    />
  );
}
