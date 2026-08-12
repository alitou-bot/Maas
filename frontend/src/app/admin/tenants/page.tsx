"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { Paginated, Plan, Tenant } from "@/types";
import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/StatCard";
import { PlanBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { formatDate } from "@/lib/utils";

export default function AdminTenantsPage() {
  const { data, isLoading, mutate } = useSWR<Paginated<Tenant>>("/tenants?limit=100");
  const { data: plans } = useSWR<Plan[]>("/plans");

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    contactEmail: "",
    planId: "",
    serverLimit: 5,
    notes: "",
  });

  const tenants = data?.data ?? [];

  async function toggleStatus(tenant: Tenant) {
    const next = tenant.status === "active" ? "suspended" : "active";
    try {
      await api.patch(`/tenants/${tenant.id}/status`, { status: next });
      await mutate();
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to update status"));
    }
  }

  const columns = useMemo<ColumnDef<Tenant, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Company name" },
      {
        accessorKey: "planName",
        header: "Plan",
        cell: ({ row }) => (
          <PlanBadge plan={row.original.planName ?? "—"} />
        ),
      },
      {
        id: "usage",
        header: "Servers used / limit",
        cell: ({ row }) =>
          `${row.original.serversUsed} / ${row.original.serverLimit}`,
      },
      { accessorKey: "userCount", header: "Users" },
      {
        accessorKey: "createdAt",
        header: "Created date",
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <button
            type="button"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              void toggleStatus(row.original);
            }}
          >
            <StatusBadge status={row.original.status} />
          </button>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Link href={`/admin/tenants/${row.original.id}?tab=settings`}>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </Link>
            <Link href={`/admin/tenants/${row.original.id}`}>
              <Button size="sm" variant="ghost">
                View
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              className="text-status-down"
              onClick={() => setDeleteTarget(row.original)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );

  async function submitTenant(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/tenants", {
        name: form.name,
        contactEmail: form.contactEmail,
        planId: form.planId,
        serverLimit: form.serverLimit,
        notes: form.notes || undefined,
      });
      await mutate();
      setAddOpen(false);
      setForm({
        name: "",
        contactEmail: "",
        planId: plans?.[0]?.id ?? "",
        serverLimit: 5,
        notes: "",
      });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to create tenant"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/tenants/${deleteTarget.id}`);
      await mutate();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to delete tenant"));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="List and manage all client companies"
        actions={
          <Button
            onClick={() => {
              setError("");
              setForm((f) => ({
                ...f,
                planId: plans?.[0]?.id ?? "",
              }));
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add tenant
          </Button>
        }
      />

      {error && (
        <p className="mb-4 text-sm text-status-down">{error}</p>
      )}

      {isInitialLoad(isLoading, data) ? (
        <TableSkeleton rows={8} />
      ) : (
        <DataTable
          data={tenants}
          columns={columns}
          searchPlaceholder="Search tenants…"
          emptyTitle="No tenants yet"
        />
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add tenant"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            {(plans?.length ?? 0) > 0 && (
              <Button
                type="submit"
                form="add-tenant-form"
                disabled={submitting || !form.planId}
              >
                {submitting ? "Creating…" : "Create tenant"}
              </Button>
            )}
          </>
        }
      >
        {(plans?.length ?? 0) === 0 ? (
          <div className="space-y-3 text-sm text-text-secondary">
            <p>
              You need at least one subscription plan before creating a tenant.
            </p>
            <Link
              href="/admin/plans"
              className="inline-flex font-medium text-accent hover:underline cursor-pointer"
              onClick={() => setAddOpen(false)}
            >
              Go to Subscription plans →
            </Link>
          </div>
        ) : (
          <form
            id="add-tenant-form"
            onSubmit={submitTenant}
            className="space-y-3"
          >
            <Input
              label="Company name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Primary contact email"
              type="email"
              required
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
              }
            />
            <Select
              label="Subscription plan"
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
              options={(plans ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              required
            />
            <Input
              label="Server limit"
              type="number"
              min={1}
              required
              value={form.serverLimit}
              onChange={(e) =>
                setForm({ ...form, serverLimit: Number(e.target.value) })
              }
            />
            <Textarea
              label="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {error && <p className="text-sm text-status-down">{error}</p>}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete tenant"
        description={`Are you sure you want to delete ${deleteTarget?.name}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
