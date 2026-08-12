"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Plus, Trash2 } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import type { Plan } from "@/types";
import { PageHeader } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { isInitialLoad } from "@/lib/live";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  maxServers: 5,
  retentionDays: 30,
  features: "",
  priceMonthly: 99,
};

export default function AdminPlansPage() {
  const { data: plans, isLoading, mutate } = useSWR<Plan[]>("/plans");

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditTarget(plan);
    setForm({
      name: plan.name,
      maxServers: plan.maxServers,
      retentionDays: plan.retentionDays,
      features: plan.features.join("\n"),
      priceMonthly: plan.priceMonthly,
    });
    setAddOpen(true);
  }

  async function submitPlan(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const features = form.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
    const payload = {
      name: form.name,
      maxServers: form.maxServers,
      retentionDays: form.retentionDays,
      features,
      priceMonthly: form.priceMonthly,
    };

    try {
      if (editTarget) {
        await api.patch(`/plans/${editTarget.id}`, payload);
      } else {
        await api.post("/plans", payload);
      }
      await mutate();
      setAddOpen(false);
      setEditTarget(null);
      setForm(emptyForm);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save plan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/plans/${deleteTarget.id}`);
      await mutate();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to delete plan"));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Subscription plans"
        description="Manage plan definitions and pricing"
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add plan
          </Button>
        }
      />

      {error && <p className="mb-4 text-sm text-status-down">{error}</p>}

      {isInitialLoad(isLoading, plans) ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : !plans?.length ? (
        <EmptyState
          icon={Check}
          title="No plans yet"
          description="Create your first subscription plan to assign to tenants."
          actionLabel="Add plan"
          onAction={openAdd}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border border-border-subtle bg-surface-raised p-5"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-text-primary">{plan.name}</h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(plan)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-status-down"
                    onClick={() => setDeleteTarget(plan)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-text-primary">
                {plan.priceMonthly === 0 ? (
                  "Free"
                ) : (
                  <>
                    ${plan.priceMonthly}
                    <span className="text-sm font-normal text-text-muted">/mo</span>
                  </>
                )}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Max servers</dt>
                  <dd className="font-medium text-text-primary">{plan.maxServers}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Retention</dt>
                  <dd className="font-medium text-text-primary">
                    {plan.retentionDays} days
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 flex-1 space-y-2 border-t border-border-subtle pt-4">
                {plan.features.length === 0 ? (
                  <li className="text-sm text-text-muted">No features listed</li>
                ) : (
                  plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {feature}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditTarget(null);
        }}
        title={editTarget ? "Edit plan" : "Add plan"}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                setEditTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form="plan-form" disabled={submitting}>
              {submitting
                ? "Saving…"
                : editTarget
                  ? "Save changes"
                  : "Create plan"}
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={submitPlan} className="space-y-3">
          <Input
            label="Plan name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Max servers"
            type="number"
            min={1}
            required
            value={form.maxServers}
            onChange={(e) =>
              setForm({ ...form, maxServers: Number(e.target.value) })
            }
          />
          <Input
            label="Retention (days)"
            type="number"
            min={1}
            required
            value={form.retentionDays}
            onChange={(e) =>
              setForm({ ...form, retentionDays: Number(e.target.value) })
            }
          />
          <Input
            label="Monthly price (USD)"
            type="number"
            min={0}
            required
            value={form.priceMonthly}
            onChange={(e) =>
              setForm({ ...form, priceMonthly: Number(e.target.value) })
            }
          />
          <Textarea
            label="Features (one per line)"
            value={form.features}
            onChange={(e) => setForm({ ...form, features: e.target.value })}
            placeholder={"Basic monitoring\nEmail alerts"}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete plan"
        description={`Are you sure you want to delete ${deleteTarget?.name}? Tenants using this plan may be affected.`}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
