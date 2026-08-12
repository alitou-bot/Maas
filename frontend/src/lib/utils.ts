import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { Role } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string | Date, pattern = "MMM d, yyyy") {
  return format(new Date(date), pattern);
}

export function formatDateTime(date: string | Date) {
  return format(new Date(date), "MMM d, yyyy HH:mm");
}

export function durationBetween(start: string, end?: string | null) {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const mins = Math.max(0, Math.round((endMs - startMs) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return `${hours}h ${rem}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function roleHome(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    case "NOC_OPERATOR":
      return "/noc/dashboard";
    case "TENANT_ADMIN":
    case "CLIENT_VIEWER":
      return "/client/dashboard";
    default:
      return "/login";
  }
}

export function roleLabel(role: Role) {
  return role.replace(/_/g, " ");
}

export function formatSla(value: number) {
  return `${value.toFixed(2)}%`;
}

export function slaColorClass(value: number) {
  if (value >= 99.9) return "text-status-up";
  if (value >= 99.0) return "text-status-warn";
  return "text-status-down";
}

export function resolveTenantId(tenantId: string | null | undefined) {
  return tenantId ?? null;
}

export function formatUptime(uptime: string | number | null | undefined) {
  const seconds = Number(uptime || 0);
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>
) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function formatDurationSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
