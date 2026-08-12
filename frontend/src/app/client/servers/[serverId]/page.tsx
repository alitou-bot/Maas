"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Server as ServerIcon, Trash2 } from "lucide-react";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EditServerDrawer } from "@/components/servers/EditServerDrawer";
import { ServerHeader } from "@/components/servers/detail/ServerHeader";
import { OverviewTab } from "@/components/servers/detail/OverviewTab";
import { SystemTab } from "@/components/servers/detail/SystemTab";
import { ProcessesTab } from "@/components/servers/detail/ProcessesTab";
import { ServicesTab } from "@/components/servers/detail/ServicesTab";
import { ContainersTab } from "@/components/servers/detail/ContainersTab";
import { NetworkTab } from "@/components/servers/detail/NetworkTab";
import { IncidentsTab } from "@/components/servers/detail/IncidentsTab";
import { AlertsTab } from "@/components/servers/detail/AlertsTab";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
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

export default function ClientServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const serverId = params.serverId as string;
  const [tab, setTab] = useState<TabId>("overview");
  useRealtimeServer(serverId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");

  const {
    data: server,
    isLoading,
    mutate,
  } = useSWR<Server>(`/servers/${serverId}`, swrFetcher, LIVE_SWR);

  const canManage =
    user?.role === "TENANT_ADMIN" || user?.role === "SUPER_ADMIN";

  async function confirmDelete() {
    if (!server) return;
    setDeleting(true);
    setActionError("");
    try {
      await api.delete(`/servers/${server.id}`);
      router.push("/client/servers");
    } catch (err) {
      setActionError(apiErrorMessage(err, "Failed to delete server"));
      setDeleting(false);
    }
  }

  if (isLoading && !server) return <TableSkeleton rows={6} />;

  if (!server) {
    return (
      <EmptyState
        icon={ServerIcon}
        title="Server not found"
        description="This server does not exist or is not part of your organization."
        actionLabel="Back to servers"
        onAction={() => router.push("/client/servers")}
      />
    );
  }

  return (
    <div>
      <ServerHeader
        server={server}
        backHref="/client/servers"
        actions={
          canManage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionError("");
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setActionError("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      {actionError && (
        <p className="mb-4 text-sm text-status-down">{actionError}</p>
      )}

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

      <EditServerDrawer
        open={editOpen}
        server={server}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          setEditOpen(false);
          void mutate();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete server"
        description={`Delete ${server.hostname}? This removes the server, its discovered network devices, and all Zabbix monitoring data.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
