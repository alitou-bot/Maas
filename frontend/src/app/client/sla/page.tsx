"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileBarChart, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { StatCardSkeleton } from "@/components/ui/EmptyState";
import { SlaDisplay } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, downloadSlaReport, swrFetcher } from "@/lib/api";
import { isInitialLoad } from "@/lib/live";
import { buildQuery, formatSla } from "@/lib/utils";
import type { ReportFormat, SlaReportMeta, SlaSummary } from "@/types";

const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_YEAR = now.getFullYear();
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type ServiceRow = SlaSummary["services"][number];

export default function ClientSlaPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "TENANT_ADMIN";
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSuccess, setGenSuccess] = useState(false);

  const { data: slaSummary, isLoading, mutate: mutateSla } = useSWR<SlaSummary>(
    `/sla${buildQuery({ year: CURRENT_YEAR, month: CURRENT_MONTH })}`,
    swrFetcher
  );
  const { data: reports, mutate: mutateReports } = useSWR<SlaReportMeta[]>(
    `/sla/reports${buildQuery({ year: CURRENT_YEAR })}`,
    swrFetcher
  );

  const { data: trendData } = useSWR(
    ["client-sla-trend", CURRENT_YEAR, CURRENT_MONTH],
    async () => {
      const points: { month: string; uptime: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        let month = CURRENT_MONTH - i;
        let year = CURRENT_YEAR;
        while (month <= 0) {
          month += 12;
          year -= 1;
        }
        try {
          const { data } = await api.get<SlaSummary>(
            `/sla${buildQuery({ year, month })}`
          );
          points.push({
            month: MONTH_NAMES[month - 1].slice(0, 3),
            uptime: data.overallUptimePercent,
          });
        } catch {
          points.push({ month: MONTH_NAMES[month - 1].slice(0, 3), uptime: 0 });
        }
      }
      return points.filter((p) => p.uptime > 0);
    }
  );

  const monthReports = slaSummary?.services ?? [];
  const avgUptime = slaSummary?.overallUptimePercent ?? 0;
  const totalDowntime = slaSummary?.totalDowntimeMinutes ?? 0;
  const totalIncidents = slaSummary?.incidentCount ?? 0;
  const avgMttr = slaSummary?.mttrMinutes ?? 0;

  const columns = useMemo<ColumnDef<ServiceRow, unknown>[]>(
    () => [
      { accessorKey: "hostname", header: "Service" },
      {
        accessorKey: "uptimePercent",
        header: "Uptime",
        cell: ({ getValue }) => <SlaDisplay value={getValue() as number} />,
      },
      {
        accessorKey: "downtimeMinutes",
        header: "Downtime",
        cell: ({ getValue }) => `${getValue()} min`,
      },
      { accessorKey: "incidentCount", header: "Incidents" },
    ],
    []
  );

  async function handleGenerate(format: ReportFormat = "PDF") {
    if (!user?.tenantId) return;
    setGenerating(true);
    setGenError("");
    setGenSuccess(false);
    try {
      await api.post("/sla/reports", {
        tenantId: user.tenantId,
        year: CURRENT_YEAR,
        month: CURRENT_MONTH,
        format,
      });
      await mutateReports();
      await mutateSla();
      setGenSuccess(true);
    } catch (e) {
      setGenError(apiErrorMessage(e, "Failed to generate report"));
    } finally {
      setGenerating(false);
    }
  }

  const pdfReport = reports?.find(
    (r) => r.month === CURRENT_MONTH && r.year === CURRENT_YEAR && r.format === "PDF"
  );
  const csvReport = reports?.find(
    (r) => r.month === CURRENT_MONTH && r.year === CURRENT_YEAR && r.format === "CSV"
  );

  return (
    <div>
      <PageHeader
        title="SLA & reports"
        description="Service level metrics and downloadable reports"
        actions={
          isAdmin ? (
            <Button onClick={() => handleGenerate("PDF")} disabled={generating}>
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating…" : "Generate report"}
            </Button>
          ) : undefined
        }
      />

      {genSuccess && (
        <p className="mb-4 rounded-lg border border-status-up/30 bg-status-up/10 px-3 py-2 text-sm text-status-up">
          Report generated successfully. Download options are available below.
        </p>
      )}
      {genError && (
        <p className="mb-4 rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down">
          {genError}
        </p>
      )}

      <div className="mb-8 rounded-xl border border-border-subtle bg-surface-raised p-5">
        <h2 className="text-lg font-semibold text-text-primary">
          {MONTH_NAMES[CURRENT_MONTH - 1]} {CURRENT_YEAR} summary
        </h2>
        {isInitialLoad(isLoading, slaSummary) ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : !slaSummary ? (
          <p className="mt-4 text-sm text-text-muted">No SLA data for this month.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Average uptime" value={formatSla(avgUptime)} icon={FileBarChart} />
            <StatCard label="Total downtime" value={`${totalDowntime} min`} />
            <StatCard label="Incidents" value={totalIncidents} />
            <StatCard label="Avg MTTR" value={`${avgMttr} min`} />
          </div>
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Per-service SLA</h2>
        <DataTable
          data={monthReports}
          columns={columns}
          searchPlaceholder="Search services…"
          emptyTitle="No SLA data for this month"
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">6-month trend</h2>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
          <div className="h-64">
            {!trendData?.length ? (
              <p className="flex h-full items-center justify-center text-sm text-text-muted">
                No trend data available.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
                  <YAxis
                    domain={[98.5, 100]}
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value ?? 0).toFixed(2)}%`,
                      "Uptime",
                    ]}
                    contentStyle={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="uptime" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Download reports</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!pdfReport}
            onClick={() => pdfReport && downloadSlaReport(pdfReport.id)}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            disabled={!csvReport}
            onClick={() => csvReport && downloadSlaReport(csvReport.id)}
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
        {!pdfReport && !csvReport && (
          <p className="mt-2 text-xs text-text-muted">
            No generated reports for this month yet.
            {isAdmin ? " Use Generate report above to create one." : ""}
          </p>
        )}
      </section>
    </div>
  );
}
