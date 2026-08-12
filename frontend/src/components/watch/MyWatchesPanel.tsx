"use client";

import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { PageHeader } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { LIVE_SWR } from "@/lib/live";
import { cn } from "@/lib/utils";
import type { TriggerStatus, WatchedEntity, WatchListResponse } from "@/types";

function TriggerPill({
  label,
  status,
}: {
  label: string;
  status: TriggerStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        status === "PROBLEM" && "bg-status-down/15 text-status-down",
        status === "OK" && "bg-status-up/15 text-status-up",
        status === "UNKNOWN" && "bg-surface-overlay text-text-muted",
      )}
    >
      {label}: {status}
    </span>
  );
}

function entityLabel(type: WatchedEntity["entityType"]) {
  switch (type) {
    case "CONTAINER":
      return "Container";
    case "SERVICE":
      return "Service";
    case "PROCESS":
      return "Process";
    case "NETWORK_DEVICE":
      return "Network device";
    case "NETWORK_INTERFACE":
      return "Interface";
    default:
      return type;
  }
}

export function MyWatchesPanel({
  serversBasePath,
}: {
  serversBasePath: string;
}) {
  const { data, isLoading, mutate } = useSWR<WatchListResponse>(
    "/watch/list",
    swrFetcher,
    LIVE_SWR,
  );

  const watches = data?.watches ?? [];

  const unwatch = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/watch/${id}`);
        await mutate();
      } catch (error) {
        window.alert(apiErrorMessage(error, "Could not remove watch"));
      }
    },
    [mutate],
  );

  const columns = useMemo<ColumnDef<WatchedEntity, unknown>[]>(
    () => [
      {
        accessorKey: "entityType",
        header: "Type",
        cell: ({ getValue }) => entityLabel(getValue() as WatchedEntity["entityType"]),
      },
      {
        accessorKey: "entityName",
        header: "Entity",
      },
      {
        accessorKey: "hostname",
        header: "Server",
        cell: ({ row }) => (
          <Link
            href={`${serversBasePath}/${row.original.serverId}`}
            className="font-medium text-accent hover:underline"
          >
            {row.original.hostname}
          </Link>
        ),
      },
      {
        id: "triggers",
        header: "Trigger status",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <TriggerPill label="Down" status={row.original.triggerStatus.down} />
            <TriggerPill
              label="Removed"
              status={row.original.triggerStatus.removed}
            />
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void unwatch(row.original.id)}
          >
            Unwatch
          </Button>
        ),
      },
    ],
    [serversBasePath, unwatch],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Watches"
        description="Entities you are monitoring for down and removed alerts via Zabbix triggers tagged source=user-watch."
      />

      {isLoading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable
          data={watches}
          columns={columns}
          searchPlaceholder="Search watches…"
          emptyTitle="No watched entities yet"
        />
      )}
    </div>
  );
}
