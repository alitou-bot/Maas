"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, UserPlus } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/StatCard";
import { RoleBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { useAuth } from "@/providers/AuthProvider";
import { api, apiErrorMessage, swrFetcher } from "@/lib/api";
import { isInitialLoad } from "@/lib/live";
import { buildQuery, formatDateTime } from "@/lib/utils";
import type { Paginated, Role, User } from "@/types";

const CLIENT_ROLES: Role[] = ["TENANT_ADMIN", "CLIENT_VIEWER"];

export default function ClientTeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "TENANT_ADMIN";

  const { data: usersPage, isLoading, mutate } = useSWR<Paginated<User>>(
    `/users${buildQuery({ limit: 100 })}`,
    swrFetcher
  );

  const members = useMemo(
    () =>
      (usersPage?.data ?? []).filter(
        (u) => u.tenantId === user?.tenantId && CLIENT_ROLES.includes(u.role)
      ),
    [usersPage?.data, user?.tenantId]
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "CLIENT_VIEWER" as Role,
  });
  const [editRole, setEditRole] = useState<Role>("CLIENT_VIEWER");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (r) => `${r.firstName} ${r.lastName}`,
        cell: ({ row }) => (
          <span className="font-medium text-text-primary">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ getValue }) => <RoleBadge role={getValue() as Role} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as User["status"]} />,
      },
      {
        accessorKey: "lastLogin",
        header: "Last login",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? formatDateTime(v) : "—";
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          if (!isAdmin || row.original.id === user?.id) return null;
          return (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditTarget(row.original);
                  setEditRole(row.original.role);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-status-down"
                onClick={() => setRemoveTarget(row.original)}
              >
                Remove
              </Button>
            </div>
          );
        },
      },
    ],
    [isAdmin, user?.id]
  );

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await api.post("/users", {
        ...inviteForm,
        tenantId: user?.tenantId,
        sendWelcomeEmail: true,
      });
      await mutate();
      setInviteOpen(false);
      setInviteForm({ firstName: "", lastName: "", email: "", role: "CLIENT_VIEWER" });
    } catch (err) {
      setFormError(apiErrorMessage(err, "Failed to invite user"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRole() {
    if (!editTarget) return;
    setSubmitting(true);
    setFormError("");
    try {
      await api.patch(`/users/${editTarget.id}`, { role: editRole });
      await mutate();
      setEditTarget(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Failed to update role"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/users/${removeTarget.id}`);
      await mutate();
      setRemoveTarget(null);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Failed to remove user"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Manage users with access to your monitoring portal"
        actions={
          isAdmin ? (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" />
              Invite user
            </Button>
          ) : undefined
        }
      />

      {formError && !inviteOpen && !editTarget && (
        <p className="mb-4 text-sm text-status-down">{formError}</p>
      )}

      {isInitialLoad(isLoading, usersPage) ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable
          data={members}
          columns={columns}
          searchPlaceholder="Search team members…"
          emptyTitle="No team members"
        />
      )}

      {isAdmin && (
        <>
          <Modal
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            title="Invite team member"
            footer={
              <>
                <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" form="invite-form" disabled={submitting}>
                  <UserPlus className="h-4 w-4" />
                  {submitting ? "Sending…" : "Send invite"}
                </Button>
              </>
            }
          >
            <form id="invite-form" onSubmit={submitInvite} className="space-y-4">
              {formError && <p className="text-sm text-status-down">{formError}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="First name"
                  required
                  value={inviteForm.firstName}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                />
                <Input
                  label="Last name"
                  required
                  value={inviteForm.lastName}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                />
              </div>
              <Input
                label="Email"
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Select
                label="Role"
                value={inviteForm.role}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, role: e.target.value as Role }))
                }
                options={[
                  { value: "CLIENT_VIEWER", label: "Client viewer" },
                  { value: "TENANT_ADMIN", label: "Tenant admin" },
                ]}
              />
            </form>
          </Modal>

          <Modal
            open={!!editTarget}
            onClose={() => setEditTarget(null)}
            title="Edit role"
            footer={
              <>
                <Button variant="secondary" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={saveRole} disabled={submitting}>
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </>
            }
          >
            {editTarget && (
              <div className="space-y-4">
                {formError && <p className="text-sm text-status-down">{formError}</p>}
                <p className="text-sm text-text-secondary">
                  Update role for{" "}
                  <span className="font-medium text-text-primary">
                    {editTarget.firstName} {editTarget.lastName}
                  </span>
                </p>
                <Select
                  label="Role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  options={[
                    { value: "CLIENT_VIEWER", label: "Client viewer" },
                    { value: "TENANT_ADMIN", label: "Tenant admin" },
                  ]}
                />
              </div>
            )}
          </Modal>

          <ConfirmDialog
            open={!!removeTarget}
            onClose={() => setRemoveTarget(null)}
            onConfirm={confirmRemove}
            title="Remove team member"
            description={`Remove ${removeTarget?.firstName} ${removeTarget?.lastName} from your organization? They will lose access immediately.`}
            confirmLabel="Remove"
          />
        </>
      )}
    </div>
  );
}
