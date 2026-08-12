import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import type { NetworkDeviceDetail } from "@/types";

function formatUptime(value: number | null) {
  if (value == null || value < 0) return "—";
  // SNMP TimeTicks are hundredths of a second.
  const seconds = Math.floor(value / 100);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days} day${days === 1 ? "" : "s"} ${hours} hour${
    hours === 1 ? "" : "s"
  }`;
}

export function DeviceHeader({
  device,
  backHref = "/noc/network",
  onBack,
}: {
  device: NetworkDeviceDetail;
  backHref?: string;
  onBack?: () => void;
}) {
  return (
    <div className="mb-6 rounded-xl border border-border-subtle bg-surface-raised p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-text-primary">
              {device.name}
            </h1>
            <StatusBadge status={device.status} />
          </div>
          <p className="mt-2 font-mono text-sm text-text-secondary">
            {device.ip || "No IP address"}
          </p>
          <p className="mt-3 max-w-3xl text-sm text-text-muted">
            {device.description || "No SNMP description available"}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Uptime {formatUptime(device.snmp.uptime)}
          </p>
        </div>
        {onBack ? (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : (
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
