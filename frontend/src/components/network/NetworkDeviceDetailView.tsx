"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Network } from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { cn } from "@/lib/utils";
import type { NetworkDeviceDetail } from "@/types";
import { AlertsTab } from "./detail/AlertsTab";
import { DeviceHeader } from "./detail/DeviceHeader";
import { InterfacesTab } from "./detail/InterfacesTab";
import { OverviewTab } from "./detail/OverviewTab";

const TABS = ["Overview", "Interfaces", "Alerts"] as const;
type Tab = (typeof TABS)[number];

export function NetworkDeviceDetailView({ basePath }: { basePath: string }) {
  const params = useParams();
  const router = useRouter();
  const zabbixHostId = params.zabbixHostId as string;
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: device, isLoading } = useSWR<NetworkDeviceDetail>(
    `/network/devices/${zabbixHostId}`,
    swrFetcher,
    TAB_REFRESH
  );

  if (isLoading && !device) return <TableSkeleton rows={6} />;
  if (!device) {
    return (
      <EmptyState
        icon={Network}
        title="Network device not found"
        description="The device no longer exists in a monitored network group."
        actionLabel="Back to network"
        onAction={() => router.push(basePath)}
      />
    );
  }

  return (
    <div>
      <DeviceHeader device={device} backHref={basePath} />

      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {TABS.map((item) => (
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
