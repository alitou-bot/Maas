import { Search } from "lucide-react";
import { Select } from "@/components/ui/Input";

export function NetworkFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
}: {
  search: string;
  status: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or IP…"
          aria-label="Search network devices"
          className="h-10 w-full rounded-lg border border-border-strong bg-surface-raised pl-9 pr-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <Select
        aria-label="Filter by device status"
        className="sm:w-44"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        options={[
          { value: "ALL", label: "All statuses" },
          { value: "UP", label: "UP" },
          { value: "DOWN", label: "DOWN" },
          { value: "UNKNOWN", label: "UNKNOWN" },
        ]}
      />
    </div>
  );
}
