"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import type { Paginated, ServerGroup, Tenant } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SERVER_OS_OPTIONS } from "@/lib/server-os";

export interface InstallScriptReady {
  serverId: string;
  installToken: string;
  installCommand: string;
  os: string;
}

interface AddServerDrawerProps {
  open: boolean;
  onClose: () => void;
  onScriptReady: (result: InstallScriptReady) => void;
  /** Pre-select tenant for SUPER_ADMIN (e.g. from tenant detail page). */
  defaultTenantId?: string;
}

export function AddServerDrawer({
  open,
  onClose,
  onScriptReady,
  defaultTenantId,
}: AddServerDrawerProps) {
  const { user } = useAuth();
  const isTenantAdmin = user?.role === "TENANT_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [form, setForm] = useState({
    tenantId: defaultTenantId || "",
    os: "ubuntu",
    groupId: "",
    notes: "",
  });
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState("");

  const { data: tenantsPage } = useSWR<Paginated<Tenant>>(
    isSuperAdmin && open ? "/tenants?limit=100" : null,
    (url: string) => api.get(url).then((r) => r.data)
  );
  const tenants = tenantsPage?.data ?? [];

  const effectiveTenantId = isTenantAdmin
    ? user?.tenantId || ""
    : form.tenantId || defaultTenantId || "";

  const groupsKey =
    open && effectiveTenantId
      ? `/groups?tenantId=${effectiveTenantId}`
      : open && isTenantAdmin
        ? "/groups"
        : null;

  const { data: groups, mutate: mutateGroups } = useSWR<ServerGroup[]>(
    groupsKey,
    (url: string) => api.get(url).then((r) => r.data)
  );

  const tenantGroups = useMemo(() => {
    if (!groups) return [];
    if (!effectiveTenantId) return groups;
    return groups.filter((g) => g.tenantId === effectiveTenantId);
  }, [groups, effectiveTenantId]);

  function reset() {
    setForm({
      tenantId: defaultTenantId || "",
      os: "ubuntu",
      groupId: "",
      notes: "",
    });
    setNewGroupName("");
    setBannerError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function createGroupInline() {
    const name = newGroupName.trim();
    if (!name) return;
    if (!isTenantAdmin && !effectiveTenantId) {
      setBannerError("Select a tenant before creating a group");
      return;
    }
    setCreatingGroup(true);
    setBannerError("");
    try {
      const payload: Record<string, string> = { name };
      if (!isTenantAdmin) payload.tenantId = effectiveTenantId;
      const { data } = await api.post<ServerGroup>("/groups", payload);
      await mutateGroups();
      setForm((f) => ({ ...f, groupId: data.id }));
      setNewGroupName("");
    } catch (err) {
      setBannerError(apiErrorMessage(err, "Failed to create group"));
    } finally {
      setCreatingGroup(false);
    }
  }

  const canSubmit =
    !!form.os &&
    (isTenantAdmin || !!effectiveTenantId) &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setBannerError("");

    const body: Record<string, unknown> = {
      os: form.os,
      notes: form.notes.trim() || undefined,
    };
    if (form.groupId) body.groupId = form.groupId;
    if (!isTenantAdmin) body.tenantId = effectiveTenantId;

    try {
      const { data } = await api.post<InstallScriptReady>("/servers", body);
      reset();
      onScriptReady(data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { reason?: string } } })
        ?.response?.status;
      const reason = (err as { response?: { data?: { reason?: string } } })?.response
        ?.data?.reason;
      if (status === 502) {
        setBannerError(
          `Zabbix registration failed: ${reason || "see server logs"}`
        );
      } else {
        setBannerError(apiErrorMessage(err, "Something went wrong. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add server"
      className="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-server-form"
            disabled={!canSubmit}
          >
            {submitting ? "Generating…" : "Generate install script"}
          </Button>
        </>
      }
    >
      <form id="add-server-form" onSubmit={onSubmit} className="space-y-4">
        {bannerError && (
          <p className="rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down">
            {bannerError}
          </p>
        )}

        <p className="text-sm text-text-muted">
          Hostname and IP are detected automatically when you run the install
          script on the target machine.
        </p>

        {!isTenantAdmin && (
          <Select
            label="Tenant"
            required
            value={form.tenantId || defaultTenantId || ""}
            onChange={(e) =>
              setForm({ ...form, tenantId: e.target.value, groupId: "" })
            }
            options={[
              { value: "", label: "Select tenant…" },
              ...tenants.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}

        {isTenantAdmin && user?.tenantName && (
          <p className="text-xs text-text-muted">
            Tenant: <span className="text-text-secondary">{user.tenantName}</span>{" "}
            (from your account)
          </p>
        )}

        <Select
          label="Operating system"
          value={form.os}
          onChange={(e) => setForm({ ...form, os: e.target.value })}
          options={[...SERVER_OS_OPTIONS]}
        />
        <p className="text-xs text-text-muted -mt-2">
          The generated install script is tailored to this OS (Ubuntu repo,
          Debian repo, Kali, RHEL, or Windows PowerShell).
        </p>

        <Select
          label="Group"
          value={form.groupId}
          onChange={(e) => setForm({ ...form, groupId: e.target.value })}
          options={[
            { value: "", label: "No group" },
            ...tenantGroups.map((g) => ({ value: g.id, label: g.name })),
          ]}
        />

        {tenantGroups.length === 0 && (
          <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-overlay/40 px-3 py-2">
            <p className="text-xs text-text-muted">
              No groups yet — type a name to create one
            </p>
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Production"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={creatingGroup || !newGroupName.trim()}
                onClick={createGroupInline}
              >
                {creatingGroup ? "…" : "Create"}
              </Button>
            </div>
          </div>
        )}

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Optional"
        />
      </form>
    </Modal>
  );
}
