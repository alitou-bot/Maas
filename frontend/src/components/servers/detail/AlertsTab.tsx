"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { SeverityBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { buildQuery, formatDateTime, formatDurationSeconds } from "@/lib/utils";
import type { Alert, Paginated } from "@/types";

export function AlertsTab({ serverId }: { serverId: string }) {
  const { data, isLoading } = useSWR<Paginated<Alert>>(
    `/alerts${buildQuery({ serverId, limit: 50 })}`,
    swrFetcher,
    TAB_REFRESH
  );

  const alerts = data?.data ?? [];

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
        cell: ({ getValue }) => (
          <SeverityBadge severity={getValue() as Alert["severity"]} />
        ),
      },
      { accessorKey: "message", header: "Message" },
      {
        accessorKey: "durationSeconds",
        header: "Duration",
        cell: ({ getValue }) =>
          formatDurationSeconds(getValue() as number),
      },
      {
        accessorKey: "linkedIncidentId",
        header: "Incident",
        cell: ({ getValue }) => {
          const id = getValue() as string | null;
          return id ? (
            <span className="font-mono text-xs text-text-secondary">
              {id.slice(0, 8)}…
            </span>
          ) : (
            "—"
          );
        },
      },
    ],
    []
  );

  if (isLoading && !data) return <TableSkeleton rows={5} />;

  return (
    <DataTable
      data={alerts}
      columns={columns}
      searchPlaceholder="Search alerts…"
      emptyTitle="No alerts for this server"
    />
  );
}
