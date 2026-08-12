import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  accent,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  accent?: "default" | "danger" | "warn" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-surface-raised p-5 transition-colors duration-200",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-muted">{label}</p>
          <p
            className={cn(
              "mt-2 text-2xl font-bold tabular-nums tracking-tight",
              accent === "danger" && "text-status-down",
              accent === "warn" && "text-status-warn",
              accent === "success" && "text-status-up",
              (!accent || accent === "default") && "text-text-primary"
            )}
          >
            {value}
          </p>
        </div>
        {Icon && (
          <div className="rounded-lg bg-accent-muted p-2 text-accent">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.value >= 0 ? "text-status-up" : "text-status-down"
              )}
            >
              {trend.value >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
          {hint && <span>{hint}</span>}
          {trend?.label && <span>{trend.label}</span>}
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MiniBar({
  value,
  label,
  color = "accent",
}: {
  value: number;
  label?: string;
  color?: "accent" | "warn" | "danger";
}) {
  const bar =
    color === "danger" || value >= 85
      ? "bg-status-down"
      : color === "warn" || value >= 70
        ? "bg-status-warn"
        : "bg-accent";
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs text-text-muted">
          <span>{label}</span>
          <span className="tabular-nums text-text-secondary">{value}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
        <div
          className={cn("h-full rounded-full transition-all duration-300", bar)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
