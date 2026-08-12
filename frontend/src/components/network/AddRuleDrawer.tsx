"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function AddRuleDrawer({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [name, setName] = useState("");
  const [ipRange, setIpRange] = useState("");
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !ipRange.trim() || !snmpCommunity.trim()) {
      setError("Complete all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{ ruleId: string }>(
        "/network/discovery/rules",
        {
          name: name.trim(),
          ipRange: ipRange.trim(),
          snmpCommunity: snmpCommunity.trim(),
        }
      );
      await api.post(`/network/discovery/rules/${data.ruleId}/scan`);
      setName("");
      setIpRange("");
      setSnmpCommunity("public");
      onStarted();
      onClose();
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Failed to start discovery scan"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close discovery rule drawer"
        className="absolute inset-0 cursor-pointer bg-black/60"
        onClick={() => !submitting && onClose()}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-rule-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-border-subtle bg-surface-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
          <h2 id="add-rule-title" className="text-lg font-semibold text-text-primary">
            Add discovery rule
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-status-down/30 bg-status-down/10 px-3 py-2 text-sm text-status-down"
              >
                {error}
              </p>
            )}
            <Input
              autoFocus
              name="ruleName"
              label="Rule name"
              required
              placeholder="Office network scan"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              name="ipRange"
              label="IP range"
              required
              placeholder="192.168.1.1-254"
              hint="Example: 192.168.1.1-254 or 10.0.0.0/24"
              value={ipRange}
              onChange={(event) => setIpRange(event.target.value)}
            />
            <Input
              name="snmpCommunity"
              label="SNMP community string"
              required
              hint="Use 'public' for most devices. Check your device admin panel."
              value={snmpCommunity}
              onChange={(event) => setSnmpCommunity(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-border-subtle px-6 py-5">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Starting…" : "Create and scan"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
