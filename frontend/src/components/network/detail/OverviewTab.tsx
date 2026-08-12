import { Activity, Clock3 } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { NetworkDeviceDetail } from "@/types";

function formatUptime(value: number | null) {
  if (value == null || value < 0) return "—";
  const seconds = Math.floor(value / 100);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export function OverviewTab({ device }: { device: NetworkDeviceDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Status"
          value={device.status}
          icon={Activity}
          accent={
            device.status === "UP"
              ? "success"
              : device.status === "DOWN"
                ? "danger"
                : "default"
          }
        />
        <StatCard
          label="Uptime"
          value={formatUptime(device.snmp.uptime)}
          icon={Clock3}
        />
      </div>

      <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
        <h2 className="text-base font-semibold text-text-primary">SNMP info</h2>
        <dl className="mt-4 grid gap-5 md:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Device description
            </dt>
            <dd className="mt-1 text-sm text-text-primary">
              {device.snmp.description || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
              System name
            </dt>
            <dd className="mt-1 text-sm text-text-primary">
              {device.snmp.systemName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Location
            </dt>
            <dd className="mt-1 text-sm text-text-primary">
              {device.snmp.location || "—"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
