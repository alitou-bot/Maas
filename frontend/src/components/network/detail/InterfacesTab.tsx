import { Network } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { NetworkDeviceDetail } from "@/types";

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

export function InterfacesTab({ device }: { device: NetworkDeviceDetail }) {
  if (device.snmp.interfaces.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No interface data available"
        description="Make sure SNMP is enabled on this device."
      />
    );
  }

  const bandwidth = new Map(
    device.snmp.bandwidth.map((entry) => [entry.key, entry])
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-raised">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-border-subtle bg-surface-overlay/50">
          <tr>
            <th className="px-4 py-3 font-semibold text-text-secondary">
              Interface name
            </th>
            <th className="px-4 py-3 font-semibold text-text-secondary">
              Status
            </th>
            <th className="px-4 py-3 font-semibold text-text-secondary">
              Bandwidth in
            </th>
            <th className="px-4 py-3 font-semibold text-text-secondary">
              Bandwidth out
            </th>
          </tr>
        </thead>
        <tbody>
          {device.snmp.interfaces.map((iface) => {
            const traffic = bandwidth.get(iface.key);
            return (
              <tr
                key={iface.key}
                className="border-b border-border-subtle last:border-0"
              >
                <td className="px-4 py-3 font-medium text-text-primary">
                  {iface.name.replace(/:\s*(Operational )?status.*$/i, "")}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        iface.status === "UP"
                          ? "bg-status-up"
                          : "bg-status-down"
                      )}
                    />
                    {iface.status}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-text-secondary">
                  {formatRate(traffic?.bytesIn ?? 0)}
                </td>
                <td className="px-4 py-3 tabular-nums text-text-secondary">
                  {formatRate(traffic?.bytesOut ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
