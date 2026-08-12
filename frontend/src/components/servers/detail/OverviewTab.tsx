"use client";

import { useId, useMemo, useState } from "react";
import useSWR from "swr";
import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { swrFetcher } from "@/lib/api";
import { TAB_REFRESH } from "@/lib/live";
import { buildQuery, cn } from "@/lib/utils";
import type { MetricSeries, Server, ServerNetworkRates } from "@/types";

const RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
] as const;

type ChartPoint = { time: string; value: number };

function metricTone(value: number) {
  if (value >= 90) return "text-status-down";
  if (value >= 70) return "text-status-warn";
  return "text-status-up";
}

function formatBytesPerSec(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatAxisTime(iso: string, rangeHours: number) {
  try {
    const d = parseISO(iso);
    if (rangeHours <= 24) return format(d, "HH:mm");
    return format(d, "MMM d");
  } catch {
    return "";
  }
}

function formatTooltipTime(iso: string) {
  try {
    return format(parseISO(iso), "MMM d, HH:mm:ss");
  } catch {
    return iso;
  }
}

function seriesStats(points: ChartPoint[]) {
  if (points.length === 0) {
    return { min: 0, max: 0, avg: 0, latest: 0 };
  }
  let min = points[0].value;
  let max = points[0].value;
  let sum = 0;
  for (const p of points) {
    min = Math.min(min, p.value);
    max = Math.max(max, p.value);
    sum += p.value;
  }
  return {
    min,
    max,
    avg: sum / points.length,
    latest: points[points.length - 1]?.value ?? 0,
  };
}

function toChart(
  series: MetricSeries | undefined,
  _rangeHours: number
): ChartPoint[] {
  return (
    series?.dataPoints.map((p) => ({
      time: p.timestamp,
      value: Number(p.value) || 0,
    })) ?? []
  );
}

export function OverviewTab({
  serverId,
  server,
}: {
  serverId: string;
  server: Server;
}) {
  const [rangeHours, setRangeHours] = useState(6);

  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - rangeHours * 3600000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [rangeHours]);

  const { data: cpuMetrics, isLoading: cpuLoading } = useSWR<MetricSeries>(
    `/servers/${serverId}/metrics${buildQuery({ metric: "cpu", from, to })}`,
    swrFetcher,
    TAB_REFRESH
  );
  const { data: memoryMetrics, isLoading: memLoading } = useSWR<MetricSeries>(
    `/servers/${serverId}/metrics${buildQuery({ metric: "memory", from, to })}`,
    swrFetcher,
    TAB_REFRESH
  );
  const { data: diskMetrics, isLoading: diskLoading } = useSWR<MetricSeries>(
    `/servers/${serverId}/metrics${buildQuery({ metric: "disk", from, to })}`,
    swrFetcher,
    TAB_REFRESH
  );
  const { data: networkMetrics, isLoading: netLoading } = useSWR<MetricSeries>(
    `/servers/${serverId}/metrics${buildQuery({ metric: "network", from, to })}`,
    swrFetcher,
    TAB_REFRESH
  );
  const { data: networkRates } = useSWR<ServerNetworkRates>(
    `/servers/${serverId}/network`,
    swrFetcher,
    TAB_REFRESH
  );

  const cpuData = useMemo(
    () => toChart(cpuMetrics, rangeHours),
    [cpuMetrics, rangeHours]
  );
  const memData = useMemo(
    () => toChart(memoryMetrics, rangeHours),
    [memoryMetrics, rangeHours]
  );
  const diskData = useMemo(
    () => toChart(diskMetrics, rangeHours),
    [diskMetrics, rangeHours]
  );
  const netData = useMemo(
    () => toChart(networkMetrics, rangeHours),
    [networkMetrics, rangeHours]
  );

  const bytesIn = networkRates?.bytesInPerSec ?? 0;
  const bytesOut = networkRates?.bytesOutPerSec ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricValueCard
          label="CPU"
          value={`${Math.round(server.cpuPercent)}%`}
          hint="Current utilization"
          valueClassName={metricTone(server.cpuPercent)}
          barPercent={server.cpuPercent}
        />
        <MetricValueCard
          label="Memory"
          value={`${Math.round(server.memPercent)}%`}
          hint="Current utilization"
          valueClassName={metricTone(server.memPercent)}
          barPercent={server.memPercent}
        />
        <MetricValueCard
          label="Disk"
          value={`${Math.round(server.diskPercent)}%`}
          hint="Root filesystem used"
          valueClassName={metricTone(server.diskPercent)}
          barPercent={server.diskPercent}
        />
        <MetricValueCard
          label="Network I/O"
          value={formatBytesPerSec(bytesIn + bytesOut)}
          hint={`${formatBytesPerSec(bytesIn)} in · ${formatBytesPerSec(bytesOut)} out`}
          valueClassName="text-text-primary"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Resource trends
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Historical series for the selected window
          </p>
        </div>
        <div
          className="flex gap-1 rounded-lg border border-border-subtle bg-surface-raised p-1"
          role="group"
          aria-label="Metric time range"
        >
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeHours(r.hours)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200 cursor-pointer",
                rangeHours === r.hours
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:bg-surface-overlay hover:text-text-primary"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricAreaChart
          title="CPU"
          unit="%"
          data={cpuData}
          color="var(--accent)"
          domain={[0, 100]}
          loading={cpuLoading && !cpuMetrics}
          rangeHours={rangeHours}
          formatValue={(v) => `${Math.round(v)}%`}
        />
        <MetricAreaChart
          title="Memory"
          unit="%"
          data={memData}
          color="var(--severity-info)"
          domain={[0, 100]}
          loading={memLoading && !memoryMetrics}
          rangeHours={rangeHours}
          formatValue={(v) => `${Math.round(v)}%`}
        />
        <MetricAreaChart
          title="Disk"
          unit="%"
          data={diskData}
          color="var(--status-warn)"
          domain={[0, 100]}
          loading={diskLoading && !diskMetrics}
          rangeHours={rangeHours}
          formatValue={(v) => `${Math.round(v)}%`}
        />
        <MetricAreaChart
          title="Network I/O"
          unit="B/s"
          data={netData}
          color="var(--severity-info)"
          domain={[0, "auto"]}
          loading={netLoading && !networkMetrics}
          rangeHours={rangeHours}
          formatValue={formatBytesPerSec}
        />
      </div>
    </div>
  );
}

function MetricValueCard({
  label,
  value,
  hint,
  valueClassName,
  barPercent,
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName: string;
  barPercent?: number;
}) {
  const clamped =
    typeof barPercent === "number" && Number.isFinite(barPercent)
      ? Math.max(0, Math.min(100, barPercent))
      : null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-raised p-5 transition-colors duration-200 hover:border-border-strong">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums tracking-tight",
          valueClassName
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
      {clamped != null && (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-overlay"
          aria-hidden
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              clamped >= 90
                ? "bg-status-down"
                : clamped >= 70
                  ? "bg-status-warn"
                  : "bg-status-up"
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MetricAreaChart({
  title,
  unit,
  data,
  color,
  domain,
  loading,
  rangeHours,
  formatValue,
}: {
  title: string;
  unit: string;
  data: ChartPoint[];
  color: string;
  domain: [number, number | "auto"] | [number, number];
  loading: boolean;
  rangeHours: number;
  formatValue: (value: number) => string;
}) {
  const gradId = useId().replace(/:/g, "");
  const stats = useMemo(() => seriesStats(data), [data]);
  const tickCount = rangeHours <= 6 ? 5 : rangeHours <= 24 ? 6 : 7;

  return (
    <div className="flex flex-col rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-sm transition-shadow duration-200 hover:border-border-strong">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {title}
        </p>
        {data.length > 0 && (
          <div className="shrink-0 rounded-md bg-surface-overlay/60 px-2.5 py-1.5 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Avg · Max
            </p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-text-secondary">
              {formatValue(stats.avg)}
              <span className="mx-1 text-text-muted">·</span>
              {formatValue(stats.max)}
            </p>
          </div>
        )}
      </div>

      <div className="h-52 w-full min-h-[13rem]">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-surface-overlay/40">
            <div className="h-1.5 w-24 animate-pulse rounded-full bg-border-strong" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-subtle bg-surface-overlay/30">
            <p className="text-sm font-medium text-text-secondary">
              No metric data
            </p>
            <p className="text-xs text-text-muted">
              Waiting for Zabbix history…
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="70%" stopColor={color} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border-subtle)"
                strokeDasharray="3 6"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tickFormatter={(iso: string) =>
                  formatAxisTime(iso, rangeHours)
                }
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
                minTickGap={28}
                interval="preserveStartEnd"
                tickCount={tickCount}
              />
              <YAxis
                domain={domain}
                width={unit === "B/s" ? 56 : 40}
                tickFormatter={(v: number) =>
                  unit === "B/s"
                    ? formatBytesPerSec(v).replace(" /s", "/s")
                    : `${Math.round(v)}`
                }
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{
                  stroke: "var(--border-strong)",
                  strokeDasharray: "4 4",
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0]?.payload as ChartPoint | undefined;
                  if (!point) return null;
                  return (
                    <div className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 shadow-lg">
                      <p className="text-[11px] text-text-muted">
                        {formatTooltipTime(point.time)}
                      </p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                        {formatValue(point.value)}
                        <span className="ml-1 text-xs font-medium text-text-muted">
                          {title}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: "var(--surface-raised)",
                  fill: color,
                }}
                isAnimationActive
                animationDuration={450}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {data.length > 0 && (
        <p className="mt-2 text-[11px] text-text-muted">
          Window min {formatValue(stats.min)} · latest{" "}
          {formatValue(stats.latest)}
        </p>
      )}
    </div>
  );
}
