"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import type { Server, ServerGroup } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import {
  normalizeServerOsValue,
  SERVER_OS_OPTIONS,
} from "@/lib/server-os";

function isValidIp(value: string) {
  const v4 =
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const v6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return v4.test(value.trim()) || v6.test(value.trim());
}

interface EditServerDrawerProps {
  open: boolean;
  server: Server | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditServerDrawer({
  open,
  server,
  onClose,
  onSuccess,
}: EditServerDrawerProps) {
  const { user } = useAuth();
  const isTenantAdmin = user?.role === "TENANT_ADMIN";

  const [form, setForm] = useState({
    hostname: "",
    ipAddress: "",
    os: "ubuntu" as string,
    groupId: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const [hostnameError, setHostnameError] = useState("");
  const [ipError, setIpError] = useState("");

  const { data: groups } = useSWR<ServerGroup[]>(open ? "/groups" : null);

  const tenantGroups = useMemo(() => {
    if (!groups || !server) return [];
    if (isTenantAdmin) return groups;
    return groups.filter((g) => g.tenantId === server.tenantId);
  }, [groups, isTenantAdmin, server]);

  useEffect(() => {
    if (!open || !server) return;
    setForm({
      hostname: server.hostname,
      ipAddress: server.ipAddress ?? "",
      os: normalizeServerOsValue(server.os),
      groupId: server.groupId ?? "",
      notes: server.notes ?? "",
    });
    setBannerError("");
    setHostnameError("");
    setIpError("");
  }, [open, server]);

  function handleClose() {
    setBannerError("");
    setHostnameError("");
    setIpError("");
    onClose();
  }

  const canSubmit =
    !!server &&
    !!form.hostname.trim() &&
    !!form.ipAddress.trim() &&
    !!form.os &&
    !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!server || !canSubmit) return;

    setBannerError("");
    setHostnameError("");
    setIpError("");

    if (!isValidIp(form.ipAddress)) {
      setIpError("Enter a valid IPv4 or IPv6 address");
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/servers/${server.id}`, {
        hostname: form.hostname.trim(),
        ipAddress: form.ipAddress.trim(),
        os: form.os,
        groupId: form.groupId || null,
        notes: form.notes.trim() || null,
      });
      onSuccess();
    } catch (err: unknown) {
      const status = (
        err as { response?: { status?: number; data?: { reason?: string } } }
      )?.response?.status;
      const reason = (
        err as { response?: { data?: { reason?: string } } }
      )?.response?.data?.reason;
      if (status === 409) {
        setHostnameError("This hostname already exists");
      } else if (status === 502) {
        setBannerError(`Zabbix update failed: ${reason || "see server logs"}`);
      } else {
        setBannerError(
          apiErrorMessage(err, "Something went wrong. Please try again.")
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open && !!server}
      onClose={handleClose}
      title="Edit server"
      className="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-server-form" disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-server-form" onSubmit={onSubmit} className="space-y-4">
        {bannerError && (
          <p className="rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down">
            {bannerError}
          </p>
        )}

        {server?.tenantName && (
          <p className="text-xs text-text-muted">
            Tenant:{" "}
            <span className="text-text-secondary">{server.tenantName}</span>
          </p>
        )}

        <Input
          label="Hostname"
          required
          value={form.hostname}
          onChange={(e) => setForm({ ...form, hostname: e.target.value })}
          error={hostnameError}
        />

        <Input
          label="IP address"
          required
          value={form.ipAddress}
          onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
          error={ipError}
        />

        <Select
          label="Operating system"
          value={form.os}
          onChange={(e) => setForm({ ...form, os: e.target.value })}
          options={[...SERVER_OS_OPTIONS]}
        />

        <Select
          label="Group"
          value={form.groupId}
          onChange={(e) => setForm({ ...form, groupId: e.target.value })}
          options={[
            { value: "", label: "No group" },
            ...tenantGroups.map((g) => ({ value: g.id, label: g.name })),
          ]}
        />

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
