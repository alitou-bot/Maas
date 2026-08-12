"use client";

import Link from "next/link";
import { Eye, Network } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, timeAgo } from "@/lib/utils";
import { WatchButton } from "@/components/watch/WatchButton";
import type { NetworkDevice } from "@/types";
import { DeviceTypeBadge } from "./DeviceTypeBadge";

function Status({ status }: { status: NetworkDevice["status"] }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold">
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          status === "UP" && "bg-status-up",
          status === "DOWN" && "animate-pulse bg-status-down",
          status === "UNKNOWN" && "bg-text-muted"
        )}
      />
      {status}
    </span>
  );
}

export function NetworkTable({
  devices,
  basePath = "/noc/network",
  onRunScan,
  onSelectDevice,
  hideGroup = false,
  watchServerId,
}: {
  devices: NetworkDevice[];
  basePath?: string;
  onRunScan?: () => void;
  onSelectDevice?: (device: NetworkDevice) => void;
  hideGroup?: boolean;
  watchServerId?: string;
}) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No network devices found"
        description={
          onRunScan
            ? "Run a discovery scan to find devices on your network."
            : "No devices have been discovered on your network yet."
        }
        actionLabel={onRunScan ? "Run scan" : undefined}
        onAction={onRunScan}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-raised">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-border-subtle bg-surface-overlay/50">
          <tr className="text-text-secondary">
            {watchServerId && <th className="px-4 py-3 font-semibold w-10" />}
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Device</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Description</th>
            {!hideGroup && (
              <th className="px-4 py-3 font-semibold">Group</th>
            )}
            <th className="px-4 py-3 font-semibold">Last seen</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr
              key={device.zabbixHostId}
              className="border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-overlay/60"
            >
              {watchServerId && (
                <td className="px-4 py-3">
                  <WatchButton
                    serverId={watchServerId}
                    entityType="NETWORK_DEVICE"
                    entityName={device.name}
                    entityMeta={{ zabbixHostId: device.zabbixHostId }}
                  />
                </td>
              )}
              <td className="px-4 py-3">
                <Status status={device.status} />
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold text-text-primary">{device.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-text-muted">
                  {device.ip || "No IP"}
                </p>
              </td>
              <td className="px-4 py-3">
                <DeviceTypeBadge type={device.type} />
              </td>
              <td
                className="max-w-xs px-4 py-3 text-text-secondary"
                title={device.description ?? undefined}
              >
                {device.description
                  ? `${device.description.slice(0, 50)}${
                      device.description.length > 50 ? "…" : ""
                    }`
                  : "—"}
              </td>
              {!hideGroup && (
                <td className="px-4 py-3 text-text-secondary">
                  {device.groupName}
                </td>
              )}
              <td className="px-4 py-3 text-text-secondary">
                {device.lastSeen ? timeAgo(device.lastSeen) : "Never"}
              </td>
              <td className="px-4 py-3 text-right">
                {onSelectDevice ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectDevice(device)}
                    aria-label={`View ${device.name}`}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                ) : (
                  <Link
                    href={`${basePath}/${device.zabbixHostId}`}
                    aria-label={`View ${device.name}`}
                    className="inline-flex"
                  >
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
