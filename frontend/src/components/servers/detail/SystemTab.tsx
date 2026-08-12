"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { cn, timeAgo } from "@/lib/utils";
import type {
  ServerFilesystem,
  ServerNetworkInterface,
  ServerSystemInfo,
} from "@/types";

function formatBits(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 bps";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let n = value;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtNum(value: number | null, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function usageColor(pct: number) {
  if (pct >= 90) return "bg-status-down";
  if (pct >= 70) return "bg-status-warn";
  return "bg-status-up";
}

export function SystemTab({ serverId }: { serverId: string }) {
  const { data, isLoading } = useSWR<ServerSystemInfo>(
    `/servers/${serverId}/system`,
    swrFetcher,
    TAB_REFRESH
  );

  const ifaceColumns = useMemo<ColumnDef<ServerNetworkInterface, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Interface" },
      {
        accessorKey: "bitsInPerSec",
        header: "In",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatBits(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "bitsOutPerSec",
        header: "Out",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatBits(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "inErrors",
        header: "Errors (in/out)",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmtNum(row.original.inErrors)} / {fmtNum(row.original.outErrors)}
          </span>
        ),
      },
      {
        accessorKey: "inDropped",
        header: "Dropped (in/out)",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmtNum(row.original.inDropped)} / {fmtNum(row.original.outDropped)}
          </span>
        ),
      },
    ],
    []
  );

  const fsColumns = useMemo<ColumnDef<ServerFilesystem, unknown>[]>(
    () => [
      { accessorKey: "mount", header: "Mount" },
      {
        accessorKey: "fstype",
        header: "Type",
        cell: ({ getValue }) => (getValue() as string) || "—",
      },
      {
        accessorKey: "totalBytes",
        header: "Size",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatBytes(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "usedBytes",
        header: "Used",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatBytes(getValue() as number)}</span>
        ),
      },
      {
        accessorKey: "usedPercent",
        header: "Usage",
        cell: ({ getValue }) => {
          const pct = getValue() as number;
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-overlay">
                <div
                  className={cn("h-full rounded-full", usageColor(pct))}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              <span className="tabular-nums text-xs">{pct.toFixed(1)}%</span>
            </div>
          );
        },
      },
      {
        accessorKey: "inodesFreePercent",
        header: "Inodes free",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v == null ? "—" : (
            <span className="tabular-nums">{v.toFixed(1)}%</span>
          );
        },
      },
    ],
    []
  );

  if (isLoading && !data) return <TableSkeleton rows={6} />;
  if (!data) return null;

  const s = data.system;

  const facts: { label: string; value: string }[] = [
    { label: "CPU cores", value: fmtNum(s.cpuCount) },
    {
      label: "Load avg (1 / 5 / 15m)",
      value: `${fmtNum(s.load1, 2)} / ${fmtNum(s.load5, 2)} / ${fmtNum(s.load15, 2)}`,
    },
    { label: "Processes", value: fmtNum(s.processes) },
    { label: "Running processes", value: fmtNum(s.runningProcesses) },
    { label: "Total memory", value: s.memTotalBytes ? formatBytes(s.memTotalBytes) : "—" },
    {
      label: "Available memory",
      value: s.memAvailableBytes ? formatBytes(s.memAvailableBytes) : "—",
    },
    {
      label: "Memory used",
      value: s.memUtilization == null ? "—" : `${s.memUtilization.toFixed(1)}%`,
    },
    {
      label: "Swap free",
      value: s.swapFreePercent == null ? "—" : `${s.swapFreePercent.toFixed(0)}%`,
    },
    { label: "Context switches /s", value: fmtNum(s.contextSwitches) },
    { label: "Interrupts /s", value: fmtNum(s.interrupts) },
    { label: "Kernel max processes", value: fmtNum(s.kernelMaxProc) },
    { label: "Kernel max open files", value: fmtNum(s.kernelMaxFiles) },
    { label: "Agent version", value: s.agentVersion ?? "—" },
    { label: "Agent hostname", value: s.agentHostname ?? "—" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          System information
        </h3>
        <div className="grid gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="bg-surface-raised p-4">
              <p className="text-xs font-medium text-text-muted">{f.label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {f.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Network interfaces
        </h3>
        <DataTable
          data={data.interfaces}
          columns={ifaceColumns}
          emptyTitle="No network interfaces reported"
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          Filesystems
        </h3>
        <DataTable
          data={data.filesystems}
          columns={fsColumns}
          emptyTitle="No filesystems reported"
        />
      </section>

      <p className="text-xs text-text-muted">
        Updated {timeAgo(data.lastUpdated)}
      </p>
    </div>
  );
}
