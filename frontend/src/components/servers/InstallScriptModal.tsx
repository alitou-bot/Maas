"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, Copy, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { swrFetcher } from "@/lib/api";
import { isWindowsOs } from "@/lib/server-os";

interface ConnectionStatus {
  installStatus: string;
  connected: boolean;
  hostname: string | null;
  lastSeen: string | null;
}

export interface InstallScriptModalProps {
  serverId: string;
  installCommand: string;
  installToken: string;
  /** Stored OS type — drives Windows vs Linux UI when set. */
  os?: string;
  onClose: () => void;
  onConnected: () => void;
  /** Base path for the server detail link, e.g. /noc/servers or /client/servers */
  serverDetailBase?: string;
}

export function InstallScriptModal({
  serverId,
  installCommand,
  os,
  onClose,
  onConnected,
  serverDetailBase = "/noc/servers",
}: InstallScriptModalProps) {
  const [connected, setConnected] = useState(false);
  const [agentHostname, setAgentHostname] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useSWR<ConnectionStatus>(
    connected ? null : `/servers/${serverId}/connection-status`,
    swrFetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      onSuccess: (data) => {
        if (data.connected || data.installStatus === "CONNECTED") {
          setConnected(true);
          setAgentHostname(data.hostname);
          setLastSeen(data.lastSeen);
          onConnected();
        }
      },
    }
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const isWindows =
    isWindowsOs(os) ||
    installCommand.includes("powershell") ||
    installCommand.includes("irm '");

  const extractScriptUrl = () => {
    if (isWindows) {
      const match = installCommand.match(/irm '([^']+)'/);
      return match?.[1] ?? "";
    }
    return installCommand
      .replace("| sudo bash", "")
      .replace("curl -fsSL ", "")
      .trim();
  };

  const handleDownload = async () => {
    const url = extractScriptUrl();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch script");
      const text = await response.text();
      const blob = new Blob([text], {
        type: isWindows ? "text/plain" : "text/x-shellscript",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = isWindows ? "install.ps1" : "script.sh";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open URL if blob download fails
      window.open(url, "_blank");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Install the agent"
      className="max-w-xl"
      footer={
        connected ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Link href={`${serverDetailBase}/${serverId}`}>
              <Button>View server dashboard</Button>
            </Link>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close — I&apos;ll connect it later
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">
            {isWindows
              ? "Run this command in an elevated PowerShell window on the target server:"
              : "Run this command on your server as root:"}
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-overlay px-3 py-3 text-xs text-text-primary whitespace-pre-wrap break-all">
            {installCommand}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy command
                </>
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={handleDownload}>
              {isWindows ? "Download install.ps1" : "Download script.sh"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-text-primary">
            What this script does:
          </p>
          <ul className="space-y-1 text-sm text-text-secondary">
            <li>✓ Detects your server hostname automatically</li>
            <li>✓ Installs Zabbix Agent (PSK-compatible)</li>
            <li>✓ Configures encrypted connection (PSK)</li>
            <li>✓ Starts monitoring immediately</li>
          </ul>
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">
            Connection status
          </p>
          {connected ? (
            <div className="space-y-1 text-sm">
              <p className="text-status-up flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Agent connected!
              </p>
              {agentHostname && (
                <p className="text-text-secondary">
                  Hostname: {agentHostname}
                </p>
              )}
              <p className="text-text-muted">
                Last seen: {lastSeen ? "just now" : "just now"}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-text-secondary">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin shrink-0" />
              <div>
                <p>Waiting for agent to connect…</p>
                <p className="text-xs text-text-muted">
                  Checking every 5 seconds
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
