import { cn } from "@/lib/utils";
import type {
  IncidentStatus,
  Role,
  ServerStatus,
  Severity,
  TenantStatus,
  UserStatus,
} from "@/types";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    CRITICAL: "bg-severity-critical text-white",
    WARNING: "bg-severity-warning/20 text-severity-warning",
    INFO: "bg-severity-info/20 text-severity-info",
  };
  return <Badge className={styles[severity]}>{severity}</Badge>;
}

export function StatusBadge({
  status,
}: {
  status: ServerStatus | TenantStatus | UserStatus | IncidentStatus | string;
}) {
  const map: Record<string, string> = {
    UP: "bg-status-up/15 text-status-up",
    RESOLVED: "bg-status-up/15 text-status-up",
    active: "bg-status-up/15 text-status-up",
    DOWN: "bg-status-down/15 text-status-down",
    OPEN: "bg-status-down/15 text-status-down",
    WARNING: "bg-status-warn/15 text-status-warn",
    IN_PROGRESS: "bg-status-warn/15 text-status-warn",
    UNKNOWN: "bg-status-unknown/20 text-status-unknown",
    suspended: "bg-status-unknown/20 text-status-unknown",
  };
  const label = String(status).replace(/_/g, " ").toLowerCase();
  return (
    <Badge className={map[status] || "bg-status-unknown/20 text-status-unknown"}>
      {label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    SUPER_ADMIN: "bg-role-admin/20 text-role-admin",
    NOC_OPERATOR: "bg-role-noc/20 text-role-noc",
    TENANT_ADMIN: "bg-role-tenant/20 text-role-tenant",
    CLIENT_VIEWER: "bg-role-viewer/20 text-text-muted",
  };
  return <Badge className={styles[role]}>{role.replace(/_/g, " ")}</Badge>;
}

export function PlanBadge({ plan }: { plan: string }) {
  return <Badge className="bg-accent-muted text-accent">{plan}</Badge>;
}

export function StatusDot({
  status,
  pulse,
}: {
  status: ServerStatus | "ok" | "warn" | "critical";
  pulse?: boolean;
}) {
  const color =
    status === "UP" || status === "ok"
      ? "bg-status-up"
      : status === "DOWN" || status === "critical"
        ? "bg-status-down"
        : status === "WARNING" || status === "warn"
          ? "bg-status-warn"
          : "bg-status-unknown";
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          color,
          pulse && "animate-pulse-dot opacity-60"
        )}
      />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

export function SlaDisplay({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const color =
    value >= 99.9
      ? "text-status-up"
      : value >= 99.0
        ? "text-status-warn"
        : "text-status-down";
  return (
    <span className={cn("font-semibold tabular-nums", color, className)}>
      {value.toFixed(2)}%
    </span>
  );
}
