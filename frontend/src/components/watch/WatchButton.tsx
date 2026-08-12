"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import useSWR from "swr";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { WatchedEntityType, WatchKey } from "@/types";

type WatchButtonProps = {
  serverId: string;
  entityType: WatchedEntityType;
  entityName: string;
  entityMeta?: Record<string, unknown>;
  /** Compact icon-only mode for table rows. */
  compact?: boolean;
};

function matchesWatch(
  watch: WatchKey,
  entityType: WatchedEntityType,
  entityName: string,
  entityMeta?: Record<string, unknown>,
) {
  if (watch.entityType !== entityType || watch.entityName !== entityName) {
    return false;
  }
  if (entityType === "NETWORK_DEVICE") {
    return watch.entityMeta?.zabbixHostId === entityMeta?.zabbixHostId;
  }
  if (entityType === "SERVICE") {
    const port = entityMeta?.port ?? entityName;
    return String(watch.entityMeta?.port ?? watch.entityName) === String(port);
  }
  return true;
}

export function WatchButton({
  serverId,
  entityType,
  entityName,
  entityMeta,
  compact = true,
}: WatchButtonProps) {
  const [busy, setBusy] = useState(false);
  const { data: keys, mutate } = useSWR<WatchKey[]>(
    `/watch/keys/${serverId}`,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const active = (keys ?? []).find((watch) =>
    matchesWatch(watch, entityType, entityName, entityMeta),
  );

  async function toggle() {
    setBusy(true);
    try {
      if (active) {
        await api.delete(`/watch/${active.id}`);
      } else {
        await api.post("/watch", {
          entityType,
          serverId,
          entityName,
          entityMeta,
        });
      }
      await mutate();
    } catch (error) {
      window.alert(apiErrorMessage(error, "Could not update watch"));
    } finally {
      setBusy(false);
    }
  }

  const label = active ? "Unwatch" : "Watch this";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      aria-pressed={Boolean(active)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50",
        compact
          ? "p-1.5 hover:bg-surface-overlay"
          : "px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-overlay",
      )}
    >
      <Star
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active
            ? "fill-amber-400 text-amber-400"
            : "text-text-muted hover:text-amber-400",
        )}
      />
      {!compact && <span>{label}</span>}
    </button>
  );
}
