"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, CheckCircle2, Network, Radio, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { api, swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { timeAgo } from "@/lib/utils";
import type { NetworkDevice, NetworkDeviceDetail, NetworkDevicesResponse } from "@/types";
import { NetworkFilters } from "@/components/network/NetworkFilters";
import { NetworkTable } from "@/components/network/NetworkTable";
import { AlertsTab } from "@/components/network/detail/AlertsTab";
import { DeviceHeader } from "@/components/network/detail/DeviceHeader";
import { InterfacesTab } from "@/components/network/detail/InterfacesTab";
import { OverviewTab } from "@/components/network/detail/OverviewTab";
import { cn } from "@/lib/utils";

const DETAIL_TABS = ["Overview", "Interfaces", "Alerts"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function DeviceDetailPanel({
  serverId,
  zabbixHostId,
  onBack,
}: {
  serverId: string;
  zabbixHostId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("Overview");
  const { data: device, isLoading } = useSWR<NetworkDeviceDetail>(
    `/servers/${serverId}/network-devices/${zabbixHostId}`,
    swrFetcher,
    TAB_REFRESH
  );

  if (isLoading && !device) return <TableSkeleton rows={5} />;

  if (!device) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-raised p-6 text-center">
        <p className="text-sm text-text-secondary">Device not found on this server.</p>
        <Button variant="secondary" className="mt-3" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to devices
        </Button>
      </div>
    );
  }

  return (
    <div>
      <DeviceHeader device={device} onBack={onBack} />

      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {DETAIL_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === item
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab device={device} />}
      {tab === "Interfaces" && <InterfacesTab device={device} />}
      {tab === "Alerts" && <AlertsTab alerts={device.alerts} />}
    </div>
  );
}

export function NetworkTab({ serverId }: { serverId: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState("");

  const { data, isLoading, mutate } = useSWR<NetworkDevicesResponse>(
    `/servers/${serverId}/network-devices`,
    swrFetcher,
    TAB_REFRESH
  );

  const devices = useMemo(() => data?.data ?? [], [data?.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesSearch =
        !needle ||
        device.name.toLowerCase().includes(needle) ||
        device.ip.toLowerCase().includes(needle);
      const matchesStatus = status === "ALL" || device.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [devices, search, status]);

  const up = devices.filter((device) => device.status === "UP").length;
  const down = devices.filter((device) => device.status === "DOWN").length;
  const latestSeen = devices.reduce<string | null>((latest, device) => {
    if (!device.lastSeen) return latest;
    if (!latest || new Date(device.lastSeen) > new Date(latest)) {
      return device.lastSeen;
    }
    return latest;
  }, null);

  async function runScan() {
    setScanning(true);
    try {
      await api.post(`/servers/${serverId}/network-devices/scan`);
      setToast("Network scan started — devices appear within a few minutes");
      window.setTimeout(() => setToast(""), 5000);
      void mutate();
    } catch {
      setToast("Could not start network scan");
      window.setTimeout(() => setToast(""), 5000);
    } finally {
      setScanning(false);
    }
  }

  if (selectedDeviceId) {
    return (
      <DeviceDetailPanel
        serverId={serverId}
        zabbixHostId={selectedDeviceId}
        onBack={() => setSelectedDeviceId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">
            ICMP-discovered devices on this server&apos;s local network. A scan
            starts automatically when the agent install completes.
          </p>
        </div>
        <Button variant="secondary" disabled={scanning} onClick={() => void runScan()}>
          <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
          {scanning ? "Scanning…" : "Run scan"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Devices found" value={devices.length} icon={Network} />
        <StatCard label="UP" value={up} icon={CheckCircle2} accent="success" />
        <StatCard label="DOWN" value={down} icon={WifiOff} accent="danger" />
        <StatCard
          label="Last activity"
          value={latestSeen ? timeAgo(latestSeen) : "No scans yet"}
          icon={Radio}
        />
      </div>

      <NetworkFilters
        search={search}
        status={status}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />

      {isLoading && !data ? (
        <TableSkeleton rows={5} />
      ) : (
        <ServerNetworkTable
          serverId={serverId}
          devices={filtered}
          onSelect={(device) => setSelectedDeviceId(device.zabbixHostId)}
          onRunScan={devices.length === 0 ? () => void runScan() : undefined}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[60] max-w-sm rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-text-primary shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ServerNetworkTable({
  serverId,
  devices,
  onSelect,
  onRunScan,
}: {
  serverId: string;
  devices: NetworkDevice[];
  onSelect: (device: NetworkDevice) => void;
  onRunScan?: () => void;
}) {
  return (
    <NetworkTable
      devices={devices}
      onRunScan={onRunScan}
      onSelectDevice={onSelect}
      hideGroup
      watchServerId={serverId}
    />
  );
}
