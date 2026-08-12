import { readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import type { Request } from 'express';

export type PublicEndpoints = {
  /** IPv4/hostname agents use for Server= (Zabbix server reachability). */
  zabbixServerIp: string;
  /** Base URL for curl install + confirm callbacks (no trailing slash). */
  backendPublicUrl: string;
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Written by the host_ip sidecar (host network) so Dockerized API can see LAN IP. */
const HOST_IP_FILE =
  process.env.MAAS_HOST_IP_FILE || '/run/maas/host-ip';

function isUsableHostname(hostname: string): boolean {
  if (!hostname || LOOPBACK.has(hostname.toLowerCase())) return false;
  if (hostname.endsWith('.internal')) return false;
  if (hostname === 'backend' || hostname === 'frontend') return false;
  return true;
}

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(1, end) : host;
  }
  const idx = host.lastIndexOf(':');
  // IPv6 without brackets unlikely in Host header; treat last :port for IPv4/hostname
  if (idx > 0 && host.indexOf(':') === idx) return host.slice(0, idx);
  return host;
}

function portFromHost(host: string): string | null {
  if (host.startsWith('[')) {
    const m = host.match(/\]:(\d+)$/);
    return m?.[1] ?? null;
  }
  const m = host.match(/:(\d+)$/);
  return m?.[1] ?? null;
}

/** Prefer non-docker LAN addresses when the process can see host NICs. */
export function detectLanIpFromNics(): string | null {
  const preferred: string[] = [];
  const fallback: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries ?? []) {
      const family = String(net.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (net.internal) continue;
      const ip = net.address;
      // Typical Docker / libvirt bridges — skip when better candidates exist
      const isDockerish =
        ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') ||
        ip.startsWith('172.19.') ||
        ip.startsWith('172.20.') ||
        ip.startsWith('172.21.') ||
        ip.startsWith('172.22.') ||
        ip.startsWith('172.23.') ||
        ip.startsWith('172.24.') ||
        ip.startsWith('172.25.') ||
        ip.startsWith('172.26.') ||
        ip.startsWith('172.27.') ||
        ip.startsWith('172.28.') ||
        ip.startsWith('172.29.') ||
        ip.startsWith('172.30.') ||
        ip.startsWith('172.31.');
      if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
        preferred.push(ip);
      } else if (!isDockerish) {
        fallback.push(ip);
      }
    }
  }
  return preferred[0] ?? fallback[0] ?? null;
}

/** Fresh LAN IP published by the host_ip sidecar (re-read every call). */
function detectLanIpFromHostFile(): string | null {
  try {
    const ip = readFileSync(HOST_IP_FILE, 'utf8').trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && isUsableHostname(ip)) {
      return ip;
    }
  } catch {
    // file not mounted / not ready yet
  }
  return null;
}

export function endpointsFromRequest(
  req?: Request,
): PublicEndpoints | null {
  if (!req) return null;

  const xfProto = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    ?.trim();
  const xfHost = String(req.headers['x-forwarded-host'] ?? '')
    .split(',')[0]
    ?.trim();
  const hostHeader = (xfHost || req.headers.host || '').trim();
  if (!hostHeader) return null;

  const hostname = stripPort(hostHeader);
  if (!isUsableHostname(hostname)) return null;

  const proto = xfProto || req.protocol || 'http';
  const port = portFromHost(hostHeader);
  let backendPublicUrl: string;
  if (!port || (port === '80' && proto === 'http') || (port === '443' && proto === 'https')) {
    backendPublicUrl = `${proto}://${hostname}`;
  } else {
    backendPublicUrl = `${proto}://${hostname}:${port}`;
  }

  return { zabbixServerIp: hostname, backendPublicUrl };
}

function endpointsFromEnv(): PublicEndpoints | null {
  const ip = (process.env.ZABBIX_PUBLIC_IP || process.env.HOST_IP || '').trim();
  const url = (process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (isUsableHostname(host)) {
        return {
          zabbixServerIp: (ip && isUsableHostname(ip) ? ip : host),
          backendPublicUrl: url,
        };
      }
    } catch {
      // ignore invalid URL
    }
  }
  if (ip && isUsableHostname(ip)) {
    return {
      zabbixServerIp: ip,
      backendPublicUrl: `http://${ip}:4000`,
    };
  }
  return null;
}

/**
 * Resolve MAAS/Zabbix reachability endpoints for install scripts.
 * Preference: request Host → env override → host NIC / docker host probe.
 */
export function resolvePublicEndpoints(req?: Request): PublicEndpoints {
  const fromReq = endpointsFromRequest(req);
  if (fromReq) return fromReq;

  // Fresh host LAN IP (sidecar) beats stale env after DHCP / NIC changes
  const detectedIp = detectLanIpFromHostFile() ?? detectLanIpFromNics();
  if (detectedIp) {
    return {
      zabbixServerIp: detectedIp,
      backendPublicUrl: `http://${detectedIp}:4000`,
    };
  }

  const fromEnv = endpointsFromEnv();
  if (fromEnv) return fromEnv;

  return {
    zabbixServerIp: '127.0.0.1',
    backendPublicUrl: 'http://127.0.0.1:4000',
  };
}
