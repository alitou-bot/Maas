"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { mutate } from "swr";
import { useAuth } from "@/providers/AuthProvider";
import { getAccessToken } from "@/lib/tokens";
import { resolveApiBase } from "@/lib/api";

function resolveWsOrigin(): string {
  const apiBase = resolveApiBase();
  const url = new URL(apiBase);
  return `${url.protocol}//${url.host}`;
}

function serializeCacheKey(key: unknown): string {
  if (typeof key === "string") return key;
  if (Array.isArray(key)) return key.map(String).join("\0");
  return "";
}

function keyMatchesResource(key: unknown, resource: string): boolean {
  const haystack = serializeCacheKey(key);
  if (!haystack) return false;

  if (resource.startsWith("server:")) {
    const id = resource.slice("server:".length);
    return haystack.includes(id);
  }

  switch (resource) {
    case "incidents":
      return (
        haystack.includes("/incidents") ||
        haystack.includes("noc-dashboard-sla")
      );
    case "servers":
      return (
        haystack.includes("/servers") ||
        haystack.includes("tenant-metrics")
      );
    case "alerts":
      return haystack.includes("/alerts");
    case "watches":
      return haystack.includes("/watch");
    case "notifications":
      return haystack.includes("/notifications");
    default:
      return false;
  }
}

function revalidateResources(resources: string[]) {
  void mutate(
    (key) => resources.some((r) => keyMatchesResource(key, r)),
    undefined,
    { revalidate: true }
  );
}

/** Debounced invalidation — batches rapid socket events. */
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
const pendingResources = new Set<string>();

function scheduleInvalidate(resources: string[]) {
  for (const r of resources) pendingResources.add(r);

  if (invalidateTimer) return;

  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    const batch = [...pendingResources];
    pendingResources.clear();
    revalidateResources(batch);
  }, 400);
}

interface RealtimeContextValue {
  subscribeServer: (serverId: string) => void;
  unsubscribeServer: (serverId: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({
  enabled,
  userId,
  children,
}: {
  enabled: boolean;
  userId: string | null;
  children: React.ReactNode;
}) {
  const socketRef = useRef<Socket | null>(null);
  const subscribedServers = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !userId) return;

    const token = getAccessToken();
    if (!token) return;

    const socket = io(`${resolveWsOrigin()}/realtime`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelayMax: 10_000,
    });

    socket.on("connect", () => {
      for (const serverId of subscribedServers.current) {
        socket.emit("subscribe", { serverId });
      }
    });

    socket.on("invalidate", (payload: { resources?: string[] }) => {
      const resources = payload?.resources ?? [];
      if (resources.length > 0) {
        scheduleInvalidate(resources);
      }
    });

    socket.on("connect_error", () => {
      // Token may have expired — next API call will refresh it; socket reconnects after.
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, userId]);

  const subscribeServer = useCallback((serverId: string) => {
    subscribedServers.current.add(serverId);
    socketRef.current?.emit("subscribe", { serverId });
  }, []);

  const unsubscribeServer = useCallback((serverId: string) => {
    subscribedServers.current.delete(serverId);
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribeServer, unsubscribeServer }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeServer(serverId: string | null | undefined) {
  const ctx = useContext(RealtimeContext);

  useEffect(() => {
    if (!ctx || !serverId) return;
    ctx.subscribeServer(serverId);
    return () => ctx.unsubscribeServer(serverId);
  }, [ctx, serverId]);
}

export function RealtimeAuthBridge({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  return (
    <RealtimeProvider enabled={!loading && !!user} userId={user?.id ?? null}>
      {children}
    </RealtimeProvider>
  );
}
