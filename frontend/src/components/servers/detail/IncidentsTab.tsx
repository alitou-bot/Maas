"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { IncidentDrawer } from "@/components/shared/IncidentDrawer";
import { DataTable } from "@/components/ui/DataTable";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { buildQuery, durationBetween, formatDateTime } from "@/lib/utils";
import type { Incident, Paginated } from "@/types";

export function IncidentsTab({ serverId }: { serverId: string }) {
  const [selected, setSelected] = useState<Incident | null>(null);
  const { data, isLoading } = useSWR<Paginated<Incident>>(
    `/incidents${buildQuery({ serverId, limit: 20 })}`,
    swrFetcher,
    TAB_REFRESH
  );

  const incidents = data?.data ?? [];

  const columns = useMemo<ColumnDef<Incident, unknown>[]>(
    () => [
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ getValue }) => (
          <SeverityBadge severity={getValue() as Incident["severity"]} />
        ),
      },
      { accessorKey: "title", header: "Title" },
      {
        accessorKey: "openedAt",
        header: "Opened at",
        cell: ({ getValue }) => formatDateTime(getValue() as string),
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) =>
          durationBetween(row.original.openedAt, row.original.resolvedAt),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as Incident["status"]} />
        ),
      },
    ],
    []
  );

  if (isLoading && !data) return <TableSkeleton rows={5} />;

  return (
    <>
      <DataTable
        data={incidents}
        columns={columns}
        searchPlaceholder="Search incidents…"
        emptyTitle="No incidents for this server"
        onRowClick={(row) => setSelected(row)}
      />
      <IncidentDrawer
        incident={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        readOnly
      />
    </>
  );
}
