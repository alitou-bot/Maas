"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/StatCard";
import { SlaDisplay } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { api, apiErrorMessage, downloadSlaReport, swrFetcher } from "@/lib/api";
import { buildQuery } from "@/lib/utils";
import type { Paginated, ReportFormat, SlaReportMeta, SlaSummary, Tenant } from "@/types";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const now = new Date();
const DEFAULT_YEAR = String(now.getFullYear());
const DEFAULT_MONTH = String(now.getMonth() + 1);

type ServiceRow = SlaSummary["services"][number] & {
  tenantName: string;
};

export default function NocSlaPage() {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(DEFAULT_MONTH);
  const [yearFilter, setYearFilter] = useState(DEFAULT_YEAR);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genTenant, setGenTenant] = useState("");
  const [genMonth, setGenMonth] = useState(DEFAULT_MONTH);
  const [genYear, setGenYear] = useState(DEFAULT_YEAR);
  const [genFormat, setGenFormat] = useState<ReportFormat>("PDF");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    `/tenants${buildQuery({ limit: 100 })}`,
    swrFetcher
  );
  const tenants = tenantsPage?.data ?? [];

  const slaKey =
    tenantFilter !== "all"
      ? `/sla${buildQuery({
          tenantId: tenantFilter,
          year: Number(yearFilter),
          month: Number(monthFilter),
        })}`
      : null;
  const { data: slaSummary, isLoading: slaLoading } = useSWR<SlaSummary>(slaKey, swrFetcher);

  const { data: allSummaries, isLoading: allLoading } = useSWR<ServiceRow[]>(
    tenantFilter === "all" && tenants.length
      ? ["noc-sla-all", yearFilter, monthFilter, tenants.map((t) => t.id).join(",")]
      : null,
    async () => {
      const rows: ServiceRow[] = [];
      await Promise.all(
        tenants.map(async (t) => {
          try {
            const { data } = await api.get<SlaSummary>(
              `/sla${buildQuery({
                tenantId: t.id,
                year: Number(yearFilter),
                month: Number(monthFilter),
              })}`
            );
            data.services.forEach((s) => {
              rows.push({ ...s, tenantName: data.tenantName });
            });
          } catch {
            /* skip tenant without data */
          }
        })
      );
      return rows;
    }
  );

  const reportsKey = `/sla/reports${buildQuery({
    tenantId: tenantFilter !== "all" ? tenantFilter : undefined,
    year: yearFilter !== "all" ? Number(yearFilter) : undefined,
  })}`;
  const { data: reports, mutate: mutateReports } = useSWR<SlaReportMeta[]>(
    reportsKey,
    swrFetcher
  );

  const serviceRows = useMemo(() => {
    if (tenantFilter !== "all") {
      if (!slaSummary) return [];
      return slaSummary.services.map((s) => ({
        ...s,
        tenantName: slaSummary.tenantName,
      }));
    }
    return allSummaries ?? [];
  }, [tenantFilter, slaSummary, allSummaries]);

  const columns = useMemo<ColumnDef<ServiceRow, unknown>[]>(
    () => [
      { accessorKey: "tenantName", header: "Tenant" },
      { accessorKey: "hostname", header: "Service / server" },
      {
        accessorKey: "uptimePercent",
        header: "Uptime %",
        cell: ({ getValue }) => <SlaDisplay value={getValue() as number} />,
      },
      {
        accessorKey: "downtimeMinutes",
        header: "Total downtime",
        cell: ({ getValue }) => `${getValue()} min`,
      },
      { accessorKey: "incidentCount", header: "Incident count" },
    ],
    []
  );

  const reportColumns = useMemo<ColumnDef<SlaReportMeta, unknown>[]>(
    () => [
      { accessorKey: "tenantName", header: "Tenant" },
      {
        id: "period",
        header: "Period",
        cell: ({ row }) => `${row.original.month}/${row.original.year}`,
      },
      { accessorKey: "format", header: "Format" },
      {
        id: "actions",
        header: "Download",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              downloadSlaReport(
                row.original.id,
                `sla-${row.original.tenantId}-${row.original.year}-${row.original.month}.${row.original.format === "PDF" ? "pdf" : "csv"}`
              )
            }
          >
            <Download className="h-3.5 w-3.5" />
            {row.original.format}
          </Button>
        ),
      },
    ],
    []
  );

  async function handleGenerate() {
    if (!genTenant) return;
    setGenerating(true);
    setGenError("");
    try {
      await api.post("/sla/reports", {
        tenantId: genTenant,
        year: Number(genYear),
        month: Number(genMonth),
        format: genFormat,
      });
      await mutateReports();
      setGenerateOpen(false);
    } catch (e) {
      setGenError(apiErrorMessage(e, "Failed to generate report"));
    } finally {
      setGenerating(false);
    }
  }

  const loading =
    tenantFilter !== "all"
      ? isInitialLoad(slaLoading, slaSummary)
      : isInitialLoad(allLoading, allSummaries);

  return (
    <div>
      <PageHeader
        title="SLA reports"
        description="SLA reporting view for all tenants"
        actions={
          <Button
            onClick={() => {
              setGenTenant(tenants[0]?.id ?? "");
              setGenerateOpen(true);
            }}
            disabled={tenants.length === 0}
          >
            <Plus className="h-4 w-4" />
            Generate report
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-3">
        <Select
          label="Tenant"
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          options={[
            { value: "all", label: "All tenants" },
            ...tenants.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          label="Month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          options={MONTHS}
        />
        <Select
          label="Year"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          options={[
            { value: "2026", label: "2026" },
            { value: "2025", label: "2025" },
          ]}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable
          data={serviceRows}
          columns={columns}
          searchPlaceholder="Search reports…"
          emptyTitle="No SLA data for selected period"
        />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Generated reports</h2>
        <DataTable
          data={reports ?? []}
          columns={reportColumns}
          searchPlaceholder="Search generated reports…"
          emptyTitle="No generated reports"
        />
      </section>

      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate SLA report"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating || !genTenant}>
              {generating ? "Generating…" : "Generate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {genError && <p className="text-sm text-status-down">{genError}</p>}
          <Select
            label="Tenant"
            value={genTenant}
            onChange={(e) => setGenTenant(e.target.value)}
            options={tenants.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            label="Month"
            value={genMonth}
            onChange={(e) => setGenMonth(e.target.value)}
            options={MONTHS}
          />
          <Select
            label="Year"
            value={genYear}
            onChange={(e) => setGenYear(e.target.value)}
            options={[
              { value: "2026", label: "2026" },
              { value: "2025", label: "2025" },
            ]}
          />
          <Select
            label="Format"
            value={genFormat}
            onChange={(e) => setGenFormat(e.target.value as ReportFormat)}
            options={[
              { value: "PDF", label: "PDF" },
              { value: "CSV", label: "CSV" },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
