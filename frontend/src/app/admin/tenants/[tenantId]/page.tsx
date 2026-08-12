"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  Download,
  FileText,
  Pencil,
  Plus,
  Server as ServerIcon,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { LIVE_SWR, isInitialLoad } from "@/lib/live";
import type {
  Incident,
  Paginated,
  Plan,
  Role,
  Server,
  SlaReportMeta,
  SlaSummary,
  Tenant,
  User,
} from "@/types";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader, StatCard } from "@/components/ui/StatCard";
import { PlanBadge, RoleBadge, StatusBadge } from "@/components/ui/Badge";
import { AddServerDrawer, type InstallScriptReady } from "@/components/servers/AddServerDrawer";
import { InstallScriptModal } from "@/components/servers/InstallScriptModal";
import { EditServerDrawer } from "@/components/servers/EditServerDrawer";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState, StatCardSkeleton, TableSkeleton } from "@/components/ui/EmptyState";
import { cn, formatDate, formatDateTime, timeAgo } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "servers", label: "Servers" },
  { id: "users", label: "Users" },
  { id: "sla", label: "SLA reports" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const NOW = new Date();

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = params.tenantId as string;

  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "overview";

  const { data: tenant, isLoading: tenantLoading, mutate: mutateTenant } =
    useSWR<Tenant>(`/tenants/${tenantId}`);
  const { data: serversPage, isLoading: serversLoading, mutate: mutateServers } =
    useSWR<Paginated<Server>>(
      `/servers?tenantId=${tenantId}&limit=100`,
      LIVE_SWR
    );
  const { data: usersPage, isLoading: usersLoading, mutate: mutateUsers } =
    useSWR<Paginated<User>>(`/users?tenantId=${tenantId}&limit=100`);
  const { data: openIncidents } = useSWR<Paginated<Incident>>(
    `/incidents?tenantId=${tenantId}&status=OPEN&limit=100`
  );
  const { data: inProgressIncidents } = useSWR<Paginated<Incident>>(
    `/incidents?tenantId=${tenantId}&status=IN_PROGRESS&limit=100`
  );
  const { data: allIncidents } = useSWR<Paginated<Incident>>(
    `/incidents?tenantId=${tenantId}&limit=100`
  );
  const { data: slaReports, isLoading: slaLoading } = useSWR<SlaReportMeta[]>(
    `/sla/reports?tenantId=${tenantId}`
  );
  const { data: slaSummary } = useSWR<SlaSummary>(
    `/sla?tenantId=${tenantId}&year=${NOW.getFullYear()}&month=${NOW.getMonth() + 1}`
  );
  const { data: plans } = useSWR<Plan[]>("/plans");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [installModal, setInstallModal] = useState<InstallScriptReady | null>(null);
  const [editServer, setEditServer] = useState<Server | null>(null);
  const [deleteServer, setDeleteServer] = useState<Server | null>(null);
  const [deletingServer, setDeletingServer] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "CLIENT_VIEWER" as Role,
    sendWelcomeEmail: true,
  });
  const [settingsForm, setSettingsForm] = useState<{
    name: string;
    planId: string;
    serverLimit: number;
    contactEmail: string;
    notes: string;
  } | null>(null);

  useEffect(() => {
    if (tenant && !settingsForm) {
      setSettingsForm({
        name: tenant.name,
        planId: tenant.planId,
        serverLimit: tenant.serverLimit,
        contactEmail: tenant.contactEmail ?? "",
        notes: tenant.notes ?? "",
      });
    }
  }, [tenant, settingsForm]);

  const tenantServers = serversPage?.data ?? [];
  const tenantUsers = usersPage?.data ?? [];
  const tenantIncidents = [
    ...(openIncidents?.data ?? []),
    ...(inProgressIncidents?.data ?? []),
  ];
  const tenantSlaReports = slaReports ?? [];

  const chartData = useMemo(() => {
    const days = 30;
    const counts = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count: 0,
        key: d.toISOString().slice(0, 10),
      };
    });
    for (const inc of allIncidents?.data ?? []) {
      const key = inc.openedAt.slice(0, 10);
      const bucket = counts.find((c) => c.key === key);
      if (bucket) bucket.count += 1;
    }
    return counts.map(({ day, count }) => ({ day, count }));
  }, [allIncidents]);

  function setTab(tab: TabId) {
    router.replace(`/admin/tenants/${tenantId}?tab=${tab}`, { scroll: false });
  }

  async function confirmDeleteServer() {
    if (!deleteServer) return;
    setDeletingServer(true);
    setError("");
    try {
      await api.delete(`/servers/${deleteServer.id}`);
      setDeleteServer(null);
      void mutateServers();
      void mutateTenant();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to delete server"));
    } finally {
      setDeletingServer(false);
    }
  }

  const serverColumns = useMemo<ColumnDef<Server, unknown>[]>(
    () => [
      { accessorKey: "hostname", header: "Hostname" },
      { accessorKey: "ipAddress", header: "IP" },
      { accessorKey: "os", header: "OS" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as Server["status"]} />
        ),
      },
      {
        accessorKey: "lastCheck",
        header: "Last check",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? formatDateTime(v) : "—";
        },
      },
      { accessorKey: "groupName", header: "Assigned group" },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setError("");
                setEditServer(row.original);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setError("");
                setDeleteServer(row.original);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const userColumns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => `${r.firstName} ${r.lastName}`,
      },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ getValue }) => <RoleBadge role={getValue() as Role} />,
      },
      {
        accessorKey: "lastLogin",
        header: "Last login",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? timeAgo(v) : "—";
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as User["status"]} />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="text-status-down"
              onClick={() => void removeUser(row.original.id)}
            >
              Remove
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/users", {
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        role: inviteForm.role,
        tenantId: tenant.id,
        sendWelcomeEmail: inviteForm.sendWelcomeEmail,
      });
      await mutateUsers();
      await mutateTenant();
      setInviteOpen(false);
      setInviteForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "CLIENT_VIEWER",
        sendWelcomeEmail: true,
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to invite user"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !settingsForm) return;
    setSubmitting(true);
    setError("");
    try {
      await api.patch(`/tenants/${tenant.id}`, {
        name: settingsForm.name,
        planId: settingsForm.planId,
        serverLimit: settingsForm.serverLimit,
        contactEmail: settingsForm.contactEmail,
        notes: settingsForm.notes || null,
      });
      await mutateTenant();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save settings"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSuspend() {
    if (!tenant) return;
    const next = tenant.status === "active" ? "suspended" : "active";
    try {
      await api.patch(`/tenants/${tenant.id}/status`, { status: next });
      await mutateTenant();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to update status"));
    }
  }

  async function deleteTenant() {
    try {
      await api.delete(`/tenants/${tenantId}`);
      router.push("/admin/tenants");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to delete tenant"));
    }
  }

  async function removeUser(userId: string) {
    try {
      await api.delete(`/users/${userId}`);
      await mutateUsers();
      await mutateTenant();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to remove user"));
    }
  }

  async function downloadReport(report: SlaReportMeta) {
    try {
      const { data } = await api.get(`/sla/reports/${report.id}/download`, {
        responseType: "blob",
      });
      const ext = report.format === "PDF" ? "pdf" : "csv";
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sla-${report.year}-${String(report.month).padStart(2, "0")}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to download report"));
    }
  }

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <StatCardSkeleton />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (!tenant) {
    return (
      <EmptyState
        icon={Building2}
        title="Tenant not found"
        description="The tenant you are looking for does not exist or may have been deleted."
        actionLabel="Back to tenants"
        onAction={() => router.push("/admin/tenants")}
      />
    );
  }

  const form = settingsForm ?? {
    name: tenant.name,
    planId: tenant.planId,
    serverLimit: tenant.serverLimit,
    contactEmail: tenant.contactEmail ?? "",
    notes: tenant.notes ?? "",
  };

  const avgSla = slaSummary?.overallUptimePercent ?? null;

  return (
    <div>
      <PageHeader
        title={tenant.name}
        description={`Tenant detail · ${tenant.contactEmail ?? "—"}`}
        actions={
          <Link href="/admin/tenants">
            <Button variant="outline">Back to tenants</Button>
          </Link>
        }
      />

      {error && <p className="mb-4 text-sm text-status-down">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border-subtle bg-surface-raised p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {tenant.name}
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  {tenant.contactEmail ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PlanBadge plan={tenant.plan?.name ?? tenant.planName ?? "—"} />
                <StatusBadge status={tenant.status} />
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-text-muted">Created</dt>
                <dd className="font-medium text-text-primary">
                  {formatDate(tenant.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Server limit</dt>
                <dd className="font-medium text-text-primary">
                  {tenant.serversUsed} / {tenant.serverLimit}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Users</dt>
                <dd className="font-medium text-text-primary">
                  {tenant.userCount}
                </dd>
              </div>
            </dl>
            {tenant.notes && (
              <p className="mt-4 text-sm text-text-secondary border-t border-border-subtle pt-4">
                {tenant.notes}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Servers monitored"
              value={tenantServers.length}
              icon={ServerIcon}
            />
            <StatCard
              label="Active incidents"
              value={tenantIncidents.length}
              icon={ShieldAlert}
              accent={tenantIncidents.length > 0 ? "danger" : "success"}
            />
            <StatCard
              label="SLA this month"
              value={avgSla != null ? `${avgSla.toFixed(2)}%` : "—"}
              icon={FileText}
              accent={
                avgSla != null && avgSla >= 99.9
                  ? "success"
                  : avgSla != null && avgSla >= 99
                    ? "warn"
                    : "default"
              }
            />
          </div>

          <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">
              Incident history (last 30 days)
            </h3>
            {(allIncidents?.data ?? []).length === 0 ? (
              <p className="text-sm text-text-muted py-8 text-center">
                No incidents in the last 30 days
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                      interval={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface-overlay)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 8,
                        color: "var(--text-primary)",
                      }}
                    />
                    <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "servers" && (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAddServerOpen(true)}>
              <Plus className="h-4 w-4" />
              Add server
            </Button>
          </div>
          {isInitialLoad(serversLoading, serversPage) ? (
            <TableSkeleton rows={5} />
          ) : (
            <DataTable
              data={tenantServers}
              columns={serverColumns}
              searchPlaceholder="Search servers…"
              emptyTitle="No servers for this tenant"
            />
          )}
          <AddServerDrawer
            open={addServerOpen}
            onClose={() => setAddServerOpen(false)}
            defaultTenantId={tenantId}
            onScriptReady={(result) => {
              setAddServerOpen(false);
              setInstallModal(result);
            }}
          />
          {installModal && (
            <InstallScriptModal
              serverId={installModal.serverId}
              installCommand={installModal.installCommand}
              installToken={installModal.installToken}
              os={installModal.os}
              onClose={() => setInstallModal(null)}
              onConnected={() => {
                void mutateServers();
                void mutateTenant();
              }}
              serverDetailBase="/noc/servers"
            />
          )}
          <EditServerDrawer
            open={!!editServer}
            server={editServer}
            onClose={() => setEditServer(null)}
            onSuccess={() => {
              setEditServer(null);
              void mutateServers();
              void mutateTenant();
            }}
          />
          <ConfirmDialog
            open={!!deleteServer}
            onClose={() => setDeleteServer(null)}
            title="Delete server"
            description={`Delete ${deleteServer?.hostname ?? "this server"}? This removes it from MAAS and Zabbix.`}
            confirmLabel="Delete"
            loading={deletingServer}
            onConfirm={() => void confirmDeleteServer()}
          />
        </>
      )}

      {activeTab === "users" && (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" />
              Invite user
            </Button>
          </div>
          {isInitialLoad(usersLoading, usersPage) ? (
            <TableSkeleton rows={5} />
          ) : (
            <DataTable
              data={tenantUsers}
              columns={userColumns}
              searchPlaceholder="Search users…"
              emptyTitle="No users for this tenant"
            />
          )}
        </>
      )}

      {activeTab === "sla" && (
        <div className="space-y-3">
          {isInitialLoad(slaLoading, slaReports) ? (
            <TableSkeleton rows={3} />
          ) : tenantSlaReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No SLA reports"
              description="Reports will appear here once generated for this tenant."
            />
          ) : (
            tenantSlaReports.map((report) => (
              <div
                key={report.id}
                className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {report.year}-{String(report.month).padStart(2, "0")}
                  </p>
                  <p className="text-sm text-text-muted">
                    {formatDate(new Date(report.year, report.month - 1, 1))} ·{" "}
                    {report.format}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void downloadReport(report)}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="max-w-xl space-y-6">
          <form
            onSubmit={saveSettings}
            className="space-y-4 rounded-xl border border-border-subtle bg-surface-raised p-5"
          >
            <h3 className="text-sm font-semibold text-text-primary">
              Tenant settings
            </h3>
            <Input
              label="Company name"
              required
              value={form.name}
              onChange={(e) =>
                setSettingsForm({ ...form, name: e.target.value })
              }
            />
            <Input
              label="Contact email"
              type="email"
              value={form.contactEmail}
              onChange={(e) =>
                setSettingsForm({ ...form, contactEmail: e.target.value })
              }
            />
            <Select
              label="Subscription plan"
              value={form.planId}
              onChange={(e) =>
                setSettingsForm({ ...form, planId: e.target.value })
              }
              options={(plans ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
            <Input
              label="Server limit"
              type="number"
              min={1}
              required
              value={form.serverLimit}
              onChange={(e) =>
                setSettingsForm({
                  ...form,
                  serverLimit: Number(e.target.value),
                })
              }
            />
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) =>
                setSettingsForm({ ...form, notes: e.target.value })
              }
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <div className="rounded-xl border border-border-subtle bg-surface-raised p-5 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Status</h3>
            <p className="text-sm text-text-muted">
              Current status: <StatusBadge status={tenant.status} />
            </p>
            <Button
              variant={tenant.status === "active" ? "outline" : "primary"}
              onClick={() => void toggleSuspend()}
            >
              {tenant.status === "active" ? "Suspend tenant" : "Reactivate tenant"}
            </Button>
          </div>

          <div className="rounded-xl border border-status-down/30 bg-surface-raised p-5 space-y-3">
            <h3 className="text-sm font-semibold text-status-down">Danger zone</h3>
            <p className="text-sm text-text-muted">
              Permanently delete this tenant and all associated data.
            </p>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete tenant
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="invite-user-form" disabled={submitting}>
              {submitting ? "Sending…" : "Send invite"}
            </Button>
          </>
        }
      >
        <form id="invite-user-form" onSubmit={inviteUser} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="First name"
              required
              value={inviteForm.firstName}
              onChange={(e) =>
                setInviteForm({ ...inviteForm, firstName: e.target.value })
              }
            />
            <Input
              label="Last name"
              required
              value={inviteForm.lastName}
              onChange={(e) =>
                setInviteForm({ ...inviteForm, lastName: e.target.value })
              }
            />
          </div>
          <Input
            label="Email"
            type="email"
            required
            value={inviteForm.email}
            onChange={(e) =>
              setInviteForm({ ...inviteForm, email: e.target.value })
            }
          />
          <Select
            label="Role"
            value={inviteForm.role}
            onChange={(e) =>
              setInviteForm({ ...inviteForm, role: e.target.value as Role })
            }
            options={[
              { value: "TENANT_ADMIN", label: "Tenant admin" },
              { value: "CLIENT_VIEWER", label: "Client viewer" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={inviteForm.sendWelcomeEmail}
              onChange={(e) =>
                setInviteForm({
                  ...inviteForm,
                  sendWelcomeEmail: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-border-strong accent-accent cursor-pointer"
            />
            Send welcome email
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete tenant"
        description={`Are you sure you want to delete ${tenant.name}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          void deleteTenant();
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
