"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/utils";
import type { Server } from "@/types";

function formatUptimeLong(uptime: string | number | null | undefined) {
  const seconds = Number(uptime || 0);
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function ServerHeader({
  server,
  backHref = "/noc/servers",
  actions,
}: {
  server: Server;
  backHref?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-text-primary">
            {server.hostname}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
            <span className="tabular-nums">{server.ipAddress}</span>
            <span>{server.os}</span>
            <StatusBadge status={server.status} />
            <span>Uptime {formatUptimeLong(server.uptime)}</span>
            <span>
              Last check{" "}
              {server.lastCheck ? timeAgo(server.lastCheck) : "—"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
