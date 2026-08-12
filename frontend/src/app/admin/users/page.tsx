"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { Paginated, Role, Tenant, User } from "@/types";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/StatCard";
import { RoleBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { timeAgo } from "@/lib/utils";

const ROLES: Role[] = [
  "SUPER_ADMIN",
  "NOC_OPERATOR",
  "TENANT_ADMIN",
  "CLIENT_VIEWER",
];

const TENANT_ROLES: Role[] = ["TENANT_ADMIN", "CLIENT_VIEWER"];

export default function AdminUsersPage() {
  const { data, isLoading, error: loadError, mutate } = useSWR<Paginated<User>>(
    "/users?limit=100"
  );
  const { data: tenantsPage } = useSWR<Paginated<Tenant>>("/tenants?limit=100");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "TENANT_ADMIN" as Role,
    tenantId: "",
  });
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "TENANT_ADMIN" as Role,
    tenantId: "",
  });

  const users = data?.data ?? [];
  const tenants = tenantsPage?.data ?? [];

  async function resetPassword(user: User) {
    setError("");
    try {
      await api.post(`/users/${user.id}/reset-password`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to reset password"));
    }
  }

  const columns = useMemo<ColumnDef<User, unknown>[]>(
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
        id: "tenant",
        header: "Tenant",
        accessorFn: (r) => {
          if (!r.tenantId) return "ZTC Internal";
          return tenants.find((t) => t.id === r.tenantId)?.name ?? "—";
        },
      },
      {
        accessorKey: "lastLogin",
        header: "Last login",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? timeAgo(v) : "Never";
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
              onClick={() => {
                setEditTarget(row.original);
                setEditForm({
                  firstName: row.original.firstName,
                  lastName: row.original.lastName,
                  email: row.original.email,
                  role: row.original.role,
                  tenantId: row.original.tenantId ?? "",
                });
                setFormError("");
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void resetPassword(row.original)}
            >
              Reset password
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-status-down"
              onClick={() => setDeactivateTarget(row.original)}
            >
              Deactivate
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenants]
  );

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    setError("");

    const needsTenant = TENANT_ROLES.includes(form.role);
    const tenantId = form.tenantId || tenants[0]?.id || "";
    if (needsTenant && !tenantId) {
      setFormError("Select a tenant for this role");
      setSubmitting(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (needsTenant) {
        payload.tenantId = tenantId;
      }

      const { data: created } = await api.post<
        User & { temporaryPassword?: string }
      >("/users", payload);
      await mutate();
      setCreateOpen(false);
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "TENANT_ADMIN",
        tenantId: tenants[0]?.id ?? "",
      });
      if (created.temporaryPassword) {
        setCreatedCredentials({
          email: created.email,
          temporaryPassword: created.temporaryPassword,
        });
      }
    } catch (err) {
      setFormError(apiErrorMessage(err, "Failed to create user"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    setFormError("");
    setError("");
    const needsTenant = TENANT_ROLES.includes(editForm.role);
    if (needsTenant && !editForm.tenantId) {
      setFormError("Select a tenant for this role");
      setSubmitting(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
      };
      payload.tenantId = needsTenant ? editForm.tenantId : null;

      await api.patch(`/users/${editTarget.id}`, payload);
      await mutate();
      setEditTarget(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Failed to update user"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await api.patch(`/users/${deactivateTarget.id}`, { status: "suspended" });
      await mutate();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to deactivate user"));
    } finally {
      setDeactivateTarget(null);
    }
  }

  const showTenant = TENANT_ROLES.includes(form.role);
  const showEditTenant = TENANT_ROLES.includes(editForm.role);
  const effectiveTenantId = form.tenantId || tenants[0]?.id || "";
  const canSubmitCreate =
    !submitting && (!showTenant || (tenants.length > 0 && !!effectiveTenantId));

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage all platform users across tenants"
        actions={
          <Button
            onClick={() => {
              setFormError("");
              setForm({
                firstName: "",
                lastName: "",
                email: "",
                role: "TENANT_ADMIN",
                tenantId: tenants[0]?.id ?? "",
              });
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create user
          </Button>
        }
      />

      {(error || loadError) && (
        <p className="mb-4 text-sm text-status-down">
          {error || apiErrorMessage(loadError, "Failed to load users")}
        </p>
      )}

      {isInitialLoad(isLoading, data) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={users}
          columns={columns}
          searchPlaceholder="Search users…"
          emptyTitle="No users yet"
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-user-form"
              disabled={!canSubmitCreate}
            >
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={submitUser} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="First name"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
            <Input
              label="Last name"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </div>
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => {
              const role = e.target.value as Role;
              setForm({
                ...form,
                role,
                tenantId: TENANT_ROLES.includes(role)
                  ? form.tenantId || tenants[0]?.id || ""
                  : "",
              });
            }}
            options={ROLES.map((r) => ({
              value: r,
              label: r.replace(/_/g, " "),
            }))}
          />
          {showTenant ? (
            tenants.length === 0 ? (
              <div className="rounded-lg border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
                <p>No tenants loaded. Create one first, then try again.</p>
                <Link
                  href="/admin/tenants"
                  className="mt-1 inline-flex font-medium underline cursor-pointer"
                  onClick={() => setCreateOpen(false)}
                >
                  Go to Tenants →
                </Link>
              </div>
            ) : (
              <Select
                label="Tenant"
                value={form.tenantId || tenants[0]?.id || ""}
                onChange={(e) =>
                  setForm({ ...form, tenantId: e.target.value })
                }
                options={tenants.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                required
              />
            )
          ) : (
            <p className="text-xs text-text-muted">
              Tenant is only required for TENANT_ADMIN / CLIENT_VIEWER roles.
            </p>
          )}
          <p className="text-xs text-text-muted">
            Email delivery is not configured yet. After create, the temporary
            password will be shown once so you can share it with the user.
          </p>
          {formError && (
            <p className="text-sm text-status-down">{formError}</p>
          )}
        </form>
      </Modal>

      <Modal
        open={!!createdCredentials}
        onClose={() => setCreatedCredentials(null)}
        title="User created"
        footer={
          <Button onClick={() => setCreatedCredentials(null)}>Done</Button>
        }
      >
        {createdCredentials && (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Copy these credentials now — the temporary password is only shown
              once.
            </p>
            <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-text-primary">
              <p>
                <span className="text-text-muted">Email: </span>
                {createdCredentials.email}
              </p>
              <p className="mt-1">
                <span className="text-text-muted">Password: </span>
                {createdCredentials.temporaryPassword}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-user-form" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <form id="edit-user-form" onSubmit={submitEdit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="First name"
              required
              value={editForm.firstName}
              onChange={(e) =>
                setEditForm({ ...editForm, firstName: e.target.value })
              }
            />
            <Input
              label="Last name"
              required
              value={editForm.lastName}
              onChange={(e) =>
                setEditForm({ ...editForm, lastName: e.target.value })
              }
            />
          </div>
          <Input
            label="Email"
            type="email"
            required
            value={editForm.email}
            onChange={(e) =>
              setEditForm({ ...editForm, email: e.target.value })
            }
          />
          <Select
            label="Role"
            value={editForm.role}
            onChange={(e) =>
              setEditForm({ ...editForm, role: e.target.value as Role })
            }
            options={ROLES.map((r) => ({
              value: r,
              label: r.replace(/_/g, " "),
            }))}
          />
          {showEditTenant && (
            <Select
              label="Tenant"
              value={editForm.tenantId}
              onChange={(e) =>
                setEditForm({ ...editForm, tenantId: e.target.value })
              }
              options={tenants.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          )}
          {formError && (
            <p className="text-sm text-status-down">{formError}</p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate user"
        description={`Deactivate ${deactivateTarget?.firstName} ${deactivateTarget?.lastName}? They will no longer be able to sign in.`}
        confirmLabel="Deactivate"
        onConfirm={() => void confirmDeactivate()}
      />
    </div>
  );
}
