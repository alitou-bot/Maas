"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Network, Plus, Radio, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { useAuth } from "@/providers/AuthProvider";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { timeAgo } from "@/lib/utils";
import type { DiscoveryRule, NetworkDevicesResponse } from "@/types";
import { AddRuleDrawer } from "./AddRuleDrawer";
import { NetworkFilters } from "./NetworkFilters";
import { NetworkTable } from "./NetworkTable";

export function NetworkDevicesView({ basePath }: { basePath: string }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [toast, setToast] = useState("");

  const { data, isLoading, mutate } = useSWR<NetworkDevicesResponse>(
    "/network/devices",
    swrFetcher,
    TAB_REFRESH
  );
  const { data: rules } = useSWR<DiscoveryRule[]>(
    isSuperAdmin ? "/network/discovery/rules" : null,
    swrFetcher
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

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 5000);
  }

  return (
    <div>
      <PageHeader
        title="Network devices"
        description="Monitor SNMP devices discovered by Zabbix."
        actions={
          isSuperAdmin ? (
            <Button onClick={() => setDrawerOpen(true)}>
              <Plus className="h-4 w-4" />
              Add discovery rule
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total devices discovered"
          value={devices.length}
          icon={Network}
        />
        <StatCard
          label="Devices UP"
          value={up}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="Devices DOWN"
          value={down}
          icon={WifiOff}
          accent="danger"
        />
        <StatCard
          label="Last scan activity"
          value={latestSeen ? timeAgo(latestSeen) : "No scans yet"}
          icon={Radio}
          hint={
            rules?.find((rule) => rule.status === "active")?.nextScan
              ? `Next ${timeAgo(
                  rules.find((rule) => rule.status === "active")!.nextScan!
                )}`
              : undefined
          }
        />
      </div>

      <div className="mb-4">
        <NetworkFilters
          search={search}
          status={status}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
        />
      </div>

      {isLoading && !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <NetworkTable
          devices={filtered}
          basePath={basePath}
          onRunScan={isSuperAdmin ? () => setDrawerOpen(true) : undefined}
        />
      )}

      {isSuperAdmin && (
        <AddRuleDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onStarted={() => {
            showToast(
              "Discovery scan started — devices will appear within 2 minutes"
            );
            void mutate();
          }}
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
