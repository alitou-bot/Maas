"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { SeverityBadge } from "@/components/ui/Badge";
import { formatDateTime, formatDurationSeconds } from "@/lib/utils";
import type { NetworkDeviceAlert } from "@/types";

export function AlertsTab({ alerts }: { alerts: NetworkDeviceAlert[] }) {
  const columns = useMemo<ColumnDef<NetworkDeviceAlert, unknown>[]>(
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
          <SeverityBadge
            severity={getValue() as NetworkDeviceAlert["severity"]}
          />
        ),
      },
      { accessorKey: "message", header: "Message" },
      {
        accessorKey: "durationSeconds",
        header: "Duration",
        cell: ({ getValue }) =>
          formatDurationSeconds(getValue() as number),
      },
    ],
    []
  );

  return (
    <DataTable
      data={alerts}
      columns={columns}
      searchPlaceholder="Search alerts…"
      emptyTitle="No alerts for this device"
    />
  );
}
