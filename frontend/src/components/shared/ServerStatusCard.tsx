"use client";

import { useRouter } from "next/navigation";
import type { Server } from "@/types";
import { StatusDot } from "@/components/ui/Badge";
import { MiniBar } from "@/components/ui/StatCard";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ServerStatusCard({
  server,
  href,
}: {
  server: Server;
  href?: string;
}) {
  const router = useRouter();
  const target = href || `/client/servers/${server.id}`;

  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      className={cn(
        "w-full text-left rounded-xl border border-border-subtle bg-surface-raised p-4 transition-colors duration-200 cursor-pointer hover:border-border-strong hover:bg-surface-overlay/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-text-primary truncate">{server.hostname}</h3>
        <StatusDot status={server.status} pulse={server.status === "DOWN"} />
      </div>
      <p className="mt-1 text-xs text-text-muted">{server.ipAddress}</p>
      <div className="mt-4 space-y-2.5">
        <MiniBar value={server.cpuPercent} label="CPU" />
        <MiniBar value={server.memPercent} label="RAM" />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Last check{" "}
        {server.lastCheck ? timeAgo(server.lastCheck) : "never"}
      </p>
    </button>
  );
}
