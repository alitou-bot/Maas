"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Server as ServerIcon } from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { ServerHeader } from "@/components/servers/detail/ServerHeader";
import { OverviewTab } from "@/components/servers/detail/OverviewTab";
import { SystemTab } from "@/components/servers/detail/SystemTab";
import { ProcessesTab } from "@/components/servers/detail/ProcessesTab";
import { ServicesTab } from "@/components/servers/detail/ServicesTab";
import { ContainersTab } from "@/components/servers/detail/ContainersTab";
import { NetworkTab } from "@/components/servers/detail/NetworkTab";
import { IncidentsTab } from "@/components/servers/detail/IncidentsTab";
import { AlertsTab } from "@/components/servers/detail/AlertsTab";
import { swrFetcher } from "@/lib/api";
import { LIVE_SWR } from "@/lib/live";
import { useRealtimeServer } from "@/providers/RealtimeProvider";
import { cn } from "@/lib/utils";
import type { Server } from "@/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "system", label: "System" },
  { id: "processes", label: "Processes" },
  { id: "services", label: "Services" },
  { id: "containers", label: "Docker containers" },
  { id: "network", label: "Network" },
  { id: "incidents", label: "Incidents" },
  { id: "alerts", label: "Alerts" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function NocServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.serverId as string;
  const [tab, setTab] = useState<TabId>("overview");
  useRealtimeServer(serverId);

  const { data: server, isLoading } = useSWR<Server>(
    `/servers/${serverId}`,
    swrFetcher,
    LIVE_SWR
  );

  if (isLoading && !server) return <TableSkeleton rows={6} />;

  if (!server) {
    return (
      <EmptyState
        icon={ServerIcon}
        title="Server not found"
        description="This server does not exist or you do not have access."
        actionLabel="Back to servers"
        onAction={() => router.push("/noc/servers")}
      />
    );
  }

  return (
    <div>
      <ServerHeader server={server} backHref="/noc/servers" />

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px",
              tab === t.id
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab serverId={serverId} server={server} />
      )}
      {tab === "system" && <SystemTab serverId={serverId} />}
      {tab === "processes" && <ProcessesTab serverId={serverId} />}
      {tab === "services" && <ServicesTab serverId={serverId} />}
      {tab === "containers" && <ContainersTab serverId={serverId} />}
      {tab === "network" && <NetworkTab serverId={serverId} />}
      {tab === "incidents" && <IncidentsTab serverId={serverId} />}
      {tab === "alerts" && <AlertsTab serverId={serverId} />}
    </div>
  );
}
