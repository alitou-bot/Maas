import { cn } from "@/lib/utils";
import type { NetworkDeviceType } from "@/types";

const styles: Record<NetworkDeviceType, string> = {
  router: "border-blue-500/25 bg-blue-500/10 text-blue-400",
  switch: "border-teal-500/25 bg-teal-500/10 text-teal-400",
  ap: "border-purple-500/25 bg-purple-500/10 text-purple-400",
  printer: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  unknown: "border-border-strong bg-surface-overlay text-text-muted",
};

const labels: Record<NetworkDeviceType, string> = {
  router: "Router",
  switch: "Switch",
  ap: "AP",
  printer: "Printer",
  unknown: "Unknown",
};

export function DeviceTypeBadge({ type }: { type: NetworkDeviceType }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        styles[type]
      )}
    >
      {labels[type]}
    </span>
  );
}
