"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import useSWR from "swr";
import type { Incident, MetricSeries } from "@/types";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { durationBetween, formatDateTime } from "@/lib/utils";
import { swrFetcher } from "@/lib/api";
import { LIVE_SWR } from "@/lib/live";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function IncidentDrawer({
  incident,
  open,
  onClose,
  readOnly,
  onAcknowledge,
  onResolve,
  onReopen,
  onAddNote,
}: {
  incident: Incident | null;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
  onAcknowledge?: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onAddNote?: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const metricsKey = useMemo(() => {
    if (!open || !incident?.serverId) return null;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 6 * 3600000).toISOString();
    return `/servers/${incident.serverId}/metrics?metric=cpu&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [open, incident?.serverId]);
  const { data: metrics } = useSWR<MetricSeries>(metricsKey, swrFetcher, LIVE_SWR);

  useEffect(() => {
    if (!open) setNote("");
  }, [open, incident?.id]);

  if (!open || !incident) return null;

  const chart =
    metrics?.dataPoints?.map((p) => ({
      time: p.timestamp,
      value: p.value,
    })) || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-black/50 cursor-pointer"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border-subtle bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">
              {incident.title}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              {incident.tenantName} · {incident.hostname}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-overlay cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Description
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {incident.description}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-3">
              Timeline
            </h3>
            <ol className="space-y-3 border-l border-border-strong pl-4">
              <li className="text-sm">
                <p className="font-medium text-text-primary">Opened</p>
                <p className="text-xs text-text-muted">
                  {formatDateTime(incident.openedAt)}
                </p>
              </li>
              {incident.acknowledgedAt && (
                <li className="text-sm">
                  <p className="font-medium text-text-primary">Acknowledged</p>
                  <p className="text-xs text-text-muted">
                    {formatDateTime(incident.acknowledgedAt)}
                  </p>
                </li>
              )}
              {incident.resolvedAt && (
                <li className="text-sm">
                  <p className="font-medium text-text-primary">Resolved</p>
                  <p className="text-xs text-text-muted">
                    {formatDateTime(incident.resolvedAt)}
                  </p>
                </li>
              )}
              <li className="text-sm">
                <p className="font-medium text-text-primary">Duration</p>
                <p className="text-xs text-text-muted">
                  {durationBetween(incident.openedAt, incident.resolvedAt)}
                </p>
              </li>
            </ol>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Affected metrics
            </h3>
            <div className="h-36 rounded-lg border border-border-subtle bg-surface-base p-2">
              {chart.length === 0 ? (
                <p className="flex h-full items-center justify-center text-xs text-text-muted">
                  No metric data
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--accent)"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">Notes</h3>
            <div className="space-y-2 mb-3">
              {(incident.notes?.length ?? 0) === 0 && (
                <p className="text-sm text-text-muted">No notes yet.</p>
              )}
              {incident.notes?.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border border-border-subtle bg-surface-base p-3"
                >
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>{n.authorName || n.author || "NOC"}</span>
                    <span>{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-text-secondary">{n.content}</p>
                </div>
              ))}
            </div>
            {!readOnly && onAddNote && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  onAddNote(note.trim());
                  setNote("");
                }}
              >
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add internal note…"
                  className="flex-1 h-10 rounded-lg border border-border-strong bg-surface-base px-3 text-sm outline-none focus:border-accent"
                />
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>
            )}
          </section>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap gap-2 border-t border-border-subtle px-5 py-4">
            {incident.status === "OPEN" && onAcknowledge && (
              <Button onClick={onAcknowledge}>Acknowledge</Button>
            )}
            {incident.status !== "RESOLVED" && onResolve && (
              <Button variant="secondary" onClick={onResolve}>
                Resolve
              </Button>
            )}
            {incident.status === "RESOLVED" && onReopen && (
              <Button variant="outline" onClick={onReopen}>
                Reopen
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
