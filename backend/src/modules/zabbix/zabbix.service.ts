import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export type MetricKind = 'cpu' | 'memory' | 'disk' | 'network';

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface HostMetricSummary {
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  lastCheck: string | null;
}

export interface ActiveAlert {
  zabbixEventId: string;
  zabbixHostId: string;
  severity: string;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
}

const ITEM_KEYS: Record<MetricKind, string> = {
  cpu: 'system.cpu.util',
  memory: 'vm.memory.size[pavailable]',
  disk: 'vfs.fs.size[/,pused]',
  network: 'net.if.in',
};

/** Disk keys used by modern Linux templates (dependent LLD) and legacy. */
const DISK_ITEM_KEYS = [
  'vfs.fs.dependent.size[/,pused]',
  'vfs.fs.size[/,pused]',
  'vfs.fs.get',
] as const;

/** Match main interface traffic counters, not errors/dropped/lo. */
const NET_IF_IN_MAIN = /^net\.if\.in\["([^"]+)"\]$/;
const NET_IF_OUT_MAIN = /^net\.if\.out\["([^"]+)"\]$/;

/** Friendly labels for well-known ports (discovery still finds everything). */
const WELL_KNOWN_PORTS: Record<number, string> = {
  22: 'SSH',
  53: 'DNS',
  80: 'HTTP',
  443: 'HTTPS',
  631: 'CUPS',
  3000: 'MAAS Frontend',
  4000: 'MAAS Backend',
  5432: 'PostgreSQL',
  5434: 'PostgreSQL (external)',
  8080: 'Zabbix Web',
  10050: 'Zabbix Agent',
  10051: 'Zabbix Server',
  3306: 'MySQL',
  6379: 'Redis',
  27017: 'MongoDB',
};

/** @deprecated kept for hosts that never got maas.services UserParameter */
const LEGACY_PROBE_PORTS = Object.keys(WELL_KNOWN_PORTS).map(Number);

const SEVERITY_MAP: Record<string, string> = {
  '0': 'INFO',
  '1': 'INFO',
  '2': 'WARNING',
  '3': 'WARNING',
  '4': 'CRITICAL',
  '5': 'CRITICAL',
};

@Injectable()
export class ZabbixService implements OnModuleInit {
  private readonly logger = new Logger(ZabbixService.name);
  private readonly mock: boolean;
  private readonly url: string;
  private readonly user: string;
  private readonly password: string;
  private authToken: string | null = null;
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.mock = this.config.get<boolean>('app.zabbix.mock') !== false;
    this.url = this.config.get<string>('app.zabbix.url') || '';
    this.user = this.config.get<string>('app.zabbix.user') || '';
    this.password = this.config.get<string>('app.zabbix.password') || '';
    this.http = axios.create({ timeout: 15000 });
  }

  onModuleInit() {
    if (this.useMock()) {
      this.logger.log(
        'Zabbix running in MOCK mode (set ZABBIX_MOCK=false and ZABBIX_URL to use real API)',
      );
    } else {
      this.logger.log(`Zabbix real API mode → ${this.url}`);
      void this.ensureUserWatchAction();
    }
  }

  private useMock(): boolean {
    return this.mock || !this.url;
  }

  private async rpc<T>(
    method: string,
    params: Record<string, unknown> | unknown[],
    options: { auth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    if (!this.url) {
      throw new Error('Zabbix URL not configured');
    }

    const needsAuth = options.auth !== false && method !== 'apiinfo.version';
    const body: Record<string, unknown> = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    if (needsAuth && method !== 'user.login') {
      if (!this.authToken) {
        await this.authenticate();
      }
      body.auth = this.authToken;
    }

    const { data } = await this.http.post(this.url, body);

    if (data.error) {
      const code = data.error.code as number | undefined;
      const message =
        data.error.data || data.error.message || 'Zabbix RPC error';

      // Session expired / invalid auth — re-login once and retry
      if (
        needsAuth &&
        method !== 'user.login' &&
        !options.retried &&
        /session|auth|not authorized|not logged in/i.test(String(message))
      ) {
        this.logger.warn(`Zabbix auth error on ${method}; re-authenticating`);
        this.authToken = null;
        await this.authenticate();
        return this.rpc<T>(method, params, { ...options, retried: true });
      }

      throw new Error(message);
    }

    return data.result as T;
  }

  private async authenticate(): Promise<void> {
    this.authToken = await this.rpc<string>(
      'user.login',
      {
        username: this.user,
        password: this.password,
      },
      { auth: false },
    );
    this.logger.log('Authenticated with Zabbix');
  }

  async testConnection(): Promise<{ connected: boolean; version: string }> {
    if (this.useMock()) {
      this.logger.debug('testConnection → mock');
      return { connected: true, version: '6.4.0-mock' };
    }
    try {
      // apiinfo.version must be called without auth
      const version = await this.rpc<string>(
        'apiinfo.version',
        {},
        { auth: false },
      );
      await this.authenticate();
      return { connected: true, version };
    } catch (e) {
      this.logger.warn(`Zabbix connection failed: ${(e as Error).message}`);
      return { connected: false, version: 'unknown' };
    }
  }

  async getHostStatus(zabbixHostId: string) {
    if (this.useMock()) {
      return {
        status: 'UP' as const,
        lastCheck: new Date().toISOString(),
        zabbixHostId,
      };
    }

    const hosts = await this.rpc<
      Array<{
        hostid: string;
        interfaces?: Array<{ available: string }>;
      }>
    >('host.get', {
      hostids: [zabbixHostId],
      output: ['hostid'],
      selectInterfaces: ['available'],
    });
    const host = hosts[0];
    const available = host?.interfaces?.[0]?.available;
    return {
      status:
        available === '1'
          ? ('UP' as const)
          : available === '2'
            ? ('DOWN' as const)
            : ('UNKNOWN' as const),
      lastCheck: new Date().toISOString(),
      zabbixHostId,
    };
  }

  async getMetrics(
    zabbixHostId: string,
    metric: MetricKind,
    from: Date,
    to: Date,
  ): Promise<MetricPoint[]> {
    if (this.useMock()) {
      return this.mockSeries(from, to, metric);
    }

    const item = await this.resolveMetricItem(zabbixHostId, metric);
    if (!item) {
      this.logger.debug(
        `No item for metric=${metric} host=${zabbixHostId} key=${ITEM_KEYS[metric]}`,
      );
      return [];
    }

    const { itemid, value_type, key_ } = item;
    const historyType = Number(value_type);
    const hours = (to.getTime() - from.getTime()) / 3_600_000;
    const timeFrom = Math.floor(from.getTime() / 1000);
    const timeTill = Math.floor(to.getTime() / 1000);

    if (hours <= 24 || key_ === 'vfs.fs.get') {
      const history = await this.rpc<Array<{ clock: string; value: string }>>(
        'history.get',
        {
          itemids: [itemid],
          history: historyType,
          time_from: timeFrom,
          time_till: timeTill,
          output: 'extend',
          sortfield: 'clock',
          sortorder: 'ASC',
          limit: 1000,
        },
      );
      return history.flatMap((h) => {
        const value = this.metricValue(metric, h.value, key_);
        return value === null
          ? []
          : [
              {
                timestamp: new Date(Number(h.clock) * 1000).toISOString(),
                value,
              },
            ];
      });
    }

    const trends = await this.rpc<
      Array<{ clock: string; value_avg: string }>
    >('trend.get', {
      itemids: [itemid],
      time_from: timeFrom,
      time_till: timeTill,
      output: ['clock', 'value_avg'],
      limit: 1000,
    });

    return trends.flatMap((t) => {
      const value = this.metricValue(metric, t.value_avg, key_);
      return value === null
        ? []
        : [
            {
              timestamp: new Date(Number(t.clock) * 1000).toISOString(),
              value,
            },
          ];
    });
  }

  /**
   * Resolve the best Zabbix item for a chart metric.
   * Disk: modern dependent LLD key → legacy size → vfs.fs.get JSON.
   * Network: main interface in-counter (skip lo / errors / dropped).
   */
  private async resolveMetricItem(
    zabbixHostId: string,
    metric: MetricKind,
  ): Promise<{ itemid: string; value_type: string; key_: string } | null> {
    if (metric === 'disk') {
      for (const key of DISK_ITEM_KEYS) {
        const items = await this.rpc<
          Array<{ itemid: string; value_type: string; key_: string; lastclock: string }>
        >('item.get', {
          hostids: [zabbixHostId],
          filter: { key_: [key] },
          output: ['itemid', 'value_type', 'key_', 'lastclock'],
          limit: 1,
        });
        if (items.length) return items[0];
      }
      return null;
    }

    if (metric === 'network') {
      return this.findPrimaryNetIfItem(zabbixHostId, 'in');
    }

    const items = await this.rpc<
      Array<{ itemid: string; value_type: string; key_: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: [ITEM_KEYS[metric]] },
      output: ['itemid', 'value_type', 'key_'],
      limit: 1,
    });
    return items[0] ?? null;
  }

  private async findPrimaryNetIfItem(
    zabbixHostId: string,
    direction: 'in' | 'out',
  ): Promise<{
    itemid: string;
    value_type: string;
    key_: string;
    lastvalue?: string;
  } | null> {
    const prefix = direction === 'in' ? 'net.if.in' : 'net.if.out';
    const mainRe = direction === 'in' ? NET_IF_IN_MAIN : NET_IF_OUT_MAIN;

    // Substring search (wildcards OFF) — `net.if.in` matches `net.if.in["eth0"]`.
    const items = await this.rpc<
      Array<{
        itemid: string;
        value_type: string;
        key_: string;
        lastvalue: string;
        lastclock: string;
      }>
    >('item.get', {
      hostids: [zabbixHostId],
      search: { key_: prefix },
      searchWildcardsEnabled: false,
      output: ['itemid', 'value_type', 'key_', 'lastvalue', 'lastclock'],
    });

    const main = items
      .map((item) => {
        const match = item.key_.match(mainRe);
        return match
          ? { item, iface: match[1], lastclock: Number(item.lastclock || 0) }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .filter((entry) => entry.iface !== 'lo');

    if (!main.length) return null;

    // Prefer the busiest interface (highest lastvalue among collected items).
    main.sort((a, b) => {
      const av = Number(a.item.lastvalue || 0);
      const bv = Number(b.item.lastvalue || 0);
      if (bv !== av) return bv - av;
      return b.lastclock - a.lastclock;
    });
    return main[0].item;
  }

  private metricValue(
    metric: MetricKind,
    rawValue: string,
    itemKey: string,
  ): number | null {
    if (metric === 'disk' && itemKey === 'vfs.fs.get') {
      try {
        const filesystems = JSON.parse(rawValue) as Array<{
          fsname?: string;
          bytes?: { pused?: number };
        }>;
        const root = filesystems.find((fs) => fs.fsname === '/');
        return typeof root?.bytes?.pused === 'number'
          ? Number(root.bytes.pused.toFixed(2))
          : null;
      } catch {
        return null;
      }
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;

    // Zabbix's pavailable item is free/available RAM; the dashboard presents
    // RAM usage, so convert it to used percent.
    if (metric === 'memory') {
      return Number(Math.max(0, Math.min(100, 100 - value)).toFixed(2));
    }
    return Number(value.toFixed(2));
  }

  async getHostSummaries(
    zabbixHostIds: string[],
  ): Promise<Map<string, HostMetricSummary>> {
    const summaries = new Map<string, HostMetricSummary>();
    if (!zabbixHostIds.length || this.useMock()) return summaries;

    try {
      const [hosts, fsItems, coreItems] = await Promise.all([
        this.rpc<
          Array<{
            hostid: string;
            interfaces?: Array<{ available: string }>;
          }>
        >('host.get', {
          hostids: zabbixHostIds,
          output: ['hostid'],
          selectInterfaces: ['available'],
        }),
        this.rpc<
          Array<{
            hostid: string;
            key_: string;
            lastvalue: string;
            lastclock: string;
          }>
        >('item.get', {
          hostids: zabbixHostIds,
          search: { key_: 'vfs.fs' },
          searchWildcardsEnabled: false,
          output: ['hostid', 'key_', 'lastvalue', 'lastclock'],
        }),
        this.rpc<
          Array<{
            hostid: string;
            key_: string;
            lastvalue: string;
            lastclock: string;
          }>
        >('item.get', {
          hostids: zabbixHostIds,
          filter: {
            key_: [ITEM_KEYS.cpu, ITEM_KEYS.memory],
          },
          output: ['hostid', 'key_', 'lastvalue', 'lastclock'],
        }),
      ]);

      const items = [...coreItems, ...fsItems];

      for (const host of hosts) {
        const available = host.interfaces?.[0]?.available;
        summaries.set(host.hostid, {
          status:
            available === '1'
              ? 'UP'
              : available === '2'
                ? 'DOWN'
                : 'UNKNOWN',
          cpuPercent: 0,
          memPercent: 0,
          diskPercent: 0,
          lastCheck: null,
        });
      }

      for (const item of items) {
        const summary = summaries.get(item.hostid);
        if (!summary || !item.lastclock || item.lastclock === '0') continue;

        let metric: MetricKind | null = null;
        if (item.key_ === ITEM_KEYS.cpu) metric = 'cpu';
        if (item.key_ === ITEM_KEYS.memory) metric = 'memory';
        if (
          item.key_ === ITEM_KEYS.disk ||
          item.key_ === 'vfs.fs.get' ||
          item.key_ === 'vfs.fs.dependent.size[/,pused]'
        ) {
          metric = 'disk';
        }
        if (!metric) continue;

        const value = this.metricValue(metric, item.lastvalue, item.key_);
        if (value !== null) {
          if (metric === 'cpu') summary.cpuPercent = value;
          if (metric === 'memory') summary.memPercent = value;
          if (metric === 'disk') summary.diskPercent = value;
        }

        const timestamp = new Date(
          Number(item.lastclock) * 1000,
        ).toISOString();
        if (!summary.lastCheck || timestamp > summary.lastCheck) {
          summary.lastCheck = timestamp;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not load live Zabbix summaries: ${(error as Error).message}`,
      );
    }

    return summaries;
  }

  async getActiveAlerts(zabbixHostIds: string[]): Promise<ActiveAlert[]> {
    if (!zabbixHostIds.length) return [];

    if (this.useMock()) {
      return zabbixHostIds.slice(0, 3).map((id, i) => ({
        zabbixEventId: `mock-evt-${id}-${i}`,
        zabbixHostId: id,
        severity: i === 0 ? 'CRITICAL' : 'WARNING',
        message: `Mock alert on host ${id}`,
        firedAt: new Date(Date.now() - i * 3600000).toISOString(),
        resolvedAt: null,
      }));
    }

    const problems = await this.rpc<
      Array<{
        eventid: string;
        name: string;
        severity: string;
        clock: string;
      }>
    >('problem.get', {
      hostids: zabbixHostIds,
      output: ['eventid', 'name', 'severity', 'clock'],
      recent: false,
      sortfield: ['eventid'],
      sortorder: 'DESC',
    });

    // Map event → host via event.get (problem.get does not always include hosts)
    const eventIds = problems.map((p) => p.eventid);
    const hostByEvent = new Map<string, string>();

    if (eventIds.length) {
      const events = await this.rpc<
        Array<{ eventid: string; hosts?: Array<{ hostid: string }> }>
      >('event.get', {
        eventids: eventIds,
        output: ['eventid'],
        selectHosts: ['hostid'],
      });
      for (const ev of events) {
        const hostId = ev.hosts?.[0]?.hostid;
        if (hostId) hostByEvent.set(ev.eventid, hostId);
      }
    }

    return problems.map((p) => ({
      zabbixEventId: p.eventid,
      zabbixHostId: hostByEvent.get(p.eventid) || zabbixHostIds[0] || '',
      severity: SEVERITY_MAP[p.severity] ?? 'INFO',
      message: p.name,
      firedAt: new Date(Number(p.clock) * 1000).toISOString(),
      resolvedAt: null,
    }));
  }

  async getUptimeData(zabbixHostId: string, from: Date, to: Date) {
    if (this.useMock()) {
      const totalSeconds = Math.max(1, (to.getTime() - from.getTime()) / 1000);
      const downtime = Math.floor(totalSeconds * 0.0015);
      return {
        uptimePercent: Number(
          (((totalSeconds - downtime) / totalSeconds) * 100).toFixed(2),
        ),
        totalDowntimeSeconds: downtime,
        zabbixHostId,
      };
    }

    const status = await this.getHostStatus(zabbixHostId);
    const totalSeconds = Math.max(1, (to.getTime() - from.getTime()) / 1000);
    const downtime =
      status.status === 'DOWN' ? Math.floor(totalSeconds * 0.01) : 0;
    return {
      uptimePercent: Number(
        (((totalSeconds - downtime) / totalSeconds) * 100).toFixed(2),
      ),
      totalDowntimeSeconds: downtime,
      zabbixHostId,
    };
  }

  async findHostGroupByName(name: string): Promise<string | null> {
    if (this.useMock()) return null;
    const groups = await this.rpc<Array<{ groupid: string; name: string }>>(
      'hostgroup.get',
      {
        filter: { name: [name] },
        output: ['groupid', 'name'],
      },
    );
    return groups[0]?.groupid ?? null;
  }

  async hostGroupExists(groupId: string): Promise<boolean> {
    if (this.useMock()) return true;
    const groups = await this.rpc<Array<{ groupid: string }>>('hostgroup.get', {
      groupids: [groupId],
      output: ['groupid'],
    });
    return groups.length > 0;
  }

  /**
   * Ensure a Zabbix host group exists for the tenant.
   * Reuses an existing group by name if create races / DB was reset.
   */
  async ensureHostGroup(
    name: string,
    existingGroupId?: string | null,
  ): Promise<string> {
    if (this.useMock()) {
      if (existingGroupId) return existingGroupId;
      const id = `mock-grp-${Date.now()}`;
      this.logger.log(`[mock] ensureHostGroup ${name} → ${id}`);
      return id;
    }

    if (existingGroupId && (await this.hostGroupExists(existingGroupId))) {
      return existingGroupId;
    }

    const byName = await this.findHostGroupByName(name);
    if (byName) {
      this.logger.log(`Reusing existing Zabbix host group "${name}" → ${byName}`);
      return byName;
    }

    try {
      const result = await this.rpc<{ groupids: string[] }>('hostgroup.create', {
        name,
      });
      const id = result.groupids[0];
      this.logger.log(`Created Zabbix host group "${name}" → ${id}`);
      return id;
    } catch (error) {
      // Race: group created between get and create
      const again = await this.findHostGroupByName(name);
      if (again) return again;
      throw error;
    }
  }

  async createHostGroup(name: string): Promise<string> {
    return this.ensureHostGroup(name, null);
  }

  private async resolveLinuxServersGroupId(): Promise<string | null> {
    if (this.useMock()) return null;
    return this.findHostGroupByName('Linux servers');
  }

  async findHostByName(hostname: string): Promise<string | null> {
    if (this.useMock()) return null;
    const hosts = await this.rpc<Array<{ hostid: string }>>('host.get', {
      filter: { host: [hostname] },
      output: ['hostid'],
    });
    return hosts[0]?.hostid ?? null;
  }

  async updateHost(params: {
    hostId: string;
    hostname?: string;
    ip?: string;
  }): Promise<void> {
    if (this.useMock()) {
      this.logger.log(
        `[mock] updateHost ${params.hostId} hostname=${params.hostname ?? '-'} ip=${params.ip ?? '-'}`,
      );
      return;
    }

    if (params.hostname) {
      await this.rpc('host.update', {
        hostid: params.hostId,
        host: params.hostname,
        name: params.hostname,
      });
    }

    if (params.ip) {
      const interfaces = await this.rpc<
        Array<{ interfaceid: string; main: string; type: string }>
      >('hostinterface.get', {
        hostids: [params.hostId],
        output: ['interfaceid', 'main', 'type'],
      });
      const agentInterface =
        interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
        interfaces.find((entry) => entry.type === '1');
      if (!agentInterface) {
        throw new Error(
          `No Zabbix agent interface found for host ${params.hostId}`,
        );
      }
      await this.rpc('hostinterface.update', {
        interfaceid: agentInterface.interfaceid,
        ip: params.ip,
        useip: 1,
        dns: '',
        port: '10050',
      });
    }

    this.logger.log(
      `Updated Zabbix host ${params.hostId}` +
        (params.hostname ? ` hostname=${params.hostname}` : '') +
        (params.ip ? ` ip=${params.ip}` : ''),
    );
  }

  async deleteHost(hostId: string): Promise<void> {
    if (this.useMock()) {
      this.logger.log(`[mock] deleteHost ${hostId}`);
      return;
    }
    try {
      await this.rpc('host.delete', [hostId]);
      this.logger.log(`Deleted Zabbix host ${hostId}`);
    } catch (error) {
      // Host may already be gone — treat as success for MAAS cleanup.
      this.logger.warn(
        `Zabbix host.delete failed for ${hostId}: ${(error as Error).message}`,
      );
    }
  }

  async createHost(params: {
    hostname: string;
    ip: string;
    groupId: string;
    templateId: string;
  }): Promise<string> {
    if (this.useMock()) {
      const id = `mock-host-${Date.now()}`;
      this.logger.log(
        `[mock] createHost ${params.hostname} (${params.ip}) → ${id}`,
      );
      return id;
    }

    // Already registered in Zabbix — return existing id (idempotent create)
    const existing = await this.findHostByName(params.hostname);
    if (existing) {
      this.logger.warn(
        `Zabbix host "${params.hostname}" already exists → ${existing}`,
      );
      await this.ensureRootDiskItem(existing);
      await this.ensureServiceItems(existing, params.ip);
      await this.ensureDockerItems(existing);
      return existing;
    }

    const groupIds = [{ groupid: params.groupId }];
    const linuxGroupId = await this.resolveLinuxServersGroupId();
    if (linuxGroupId && linuxGroupId !== params.groupId) {
      groupIds.push({ groupid: linuxGroupId });
    }

    try {
      const result = await this.rpc<{ hostids: string[] }>('host.create', {
        host: params.hostname,
        name: params.hostname,
        interfaces: [
          {
            type: 1,
            main: 1,
            useip: 1,
            ip: params.ip,
            dns: '',
            port: '10050',
          },
        ],
        groups: groupIds,
        templates: [{ templateid: params.templateId }],
      });
      const hostId = result.hostids[0];
      this.logger.log(
        `Created Zabbix host "${params.hostname}" (${params.ip}) → ${hostId}`,
      );
      await this.ensureRootDiskItem(hostId);
      await this.ensureServiceItems(hostId, params.ip);
      await this.ensureDockerItems(hostId);
      return hostId;
    } catch (error) {
      // Concurrent create — fetch id
      const again = await this.findHostByName(params.hostname);
      if (again) return again;
      this.logger.error(
        `Zabbix host.create failed for "${params.hostname}": ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * The stock Linux template discovers filesystems through vfs.fs.get.
   * Some containerized agents never populate that master item, so create a
   * direct root usage item as a reliable source for MAAS disk charts.
   */
  async ensureRootDiskItem(hostId: string): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ itemid: string }>>('item.get', {
      hostids: [hostId],
      filter: { key_: [ITEM_KEYS.disk] },
      output: ['itemid'],
      limit: 1,
    });
    if (existing.length) return;

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [hostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const agentInterface =
      interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
      interfaces.find((entry) => entry.type === '1');
    if (!agentInterface) {
      throw new Error(`No Zabbix agent interface found for host ${hostId}`);
    }

    const result = await this.rpc<{ itemids: string[] }>('item.create', {
      hostid: hostId,
      interfaceid: agentInterface.interfaceid,
      name: 'MAAS: Root filesystem usage',
      key_: ITEM_KEYS.disk,
      type: 0,
      value_type: 0,
      delay: '1m',
      units: '%',
      history: '30d',
      trends: '365d',
    });
    this.logger.log(
      `Created root disk item for Zabbix host ${hostId} → ${result.itemids[0]}`,
    );
  }

  /**
   * Ensures the maas.services UserParameter item exists (listening TCP ports
   * discovered on the host). Idempotent. serverIp is unused but kept so call
   * sites that pass it stay compatible.
   */
  async ensureServiceItems(hostId: string, _serverIp?: string): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ key_: string }>>('item.get', {
      hostids: [hostId],
      filter: { key_: ['maas.services'] },
      output: ['key_'],
    });
    if (existing.some((item) => item.key_ === 'maas.services')) return;

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [hostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const agentInterface =
      interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
      interfaces.find((entry) => entry.type === '1');
    if (!agentInterface) return;

    try {
      await this.rpc('item.create', {
        hostid: hostId,
        interfaceid: agentInterface.interfaceid,
        name: 'MAAS: Listening TCP services',
        key_: 'maas.services',
        type: 0,
        value_type: 4,
        delay: '1m',
        history: '7d',
        trends: '0',
      });
      this.logger.log(`Created maas.services item for Zabbix host ${hostId}`);
    } catch (error) {
      this.logger.debug(
        `item.create maas.services failed: ${(error as Error).message}`,
      );
    }
  }

  private serviceDisplayName(port: number, process?: string): string {
    const known = WELL_KNOWN_PORTS[port];
    const proc = process?.trim();
    if (proc && known && proc.toLowerCase() !== known.toLowerCase()) {
      return `${known} (${proc})`;
    }
    if (proc) return proc;
    if (known) return known;
    return `Port ${port}`;
  }

  async getProcesses(zabbixHostId: string): Promise<
    Array<{
      name: string;
      instances: number;
      cpuPercent: number;
      memoryBytes: number;
      status: string;
    }>
  > {
    if (this.useMock()) {
      return [
        {
          name: 'dockerd',
          instances: 1,
          cpuPercent: 0.5,
          memoryBytes: 45678900,
          status: 'running',
        },
        {
          name: 'postgres',
          instances: 3,
          cpuPercent: 0.2,
          memoryBytes: 12345678,
          status: 'running',
        },
      ];
    }

    // Prefer live process snapshot from proc.get (Agent 6.4+/7).
    try {
      await this.ensureProcGetItem(zabbixHostId);
    } catch (error) {
      this.logger.debug(
        `ensureProcGetItem skipped: ${(error as Error).message}`,
      );
    }

    const procGetItems = await this.rpc<
      Array<{ key_: string; lastvalue: string; lastclock: string; error?: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: ['maas.processes', 'proc.get'] },
      output: ['key_', 'lastvalue', 'lastclock', 'error'],
    });

    const procItem =
      procGetItems.find(
        (item) =>
          item.key_ === 'maas.processes' &&
          Number(item.lastclock) &&
          item.lastvalue,
      ) ??
      procGetItems.find(
        (item) =>
          item.key_ === 'proc.get' && Number(item.lastclock) && item.lastvalue,
      );

    if (procItem?.lastvalue) {
      try {
        type ProcEntry = {
          name?: string;
          state?: string;
          rss?: number;
          pmem?: number;
          instances?: number;
          memoryBytes?: number;
          cpuPercent?: number;
          status?: string;
        };
        const listed = this.parseJsonArrayLenient(
          procItem.lastvalue,
        ) as ProcEntry[] | null;
        if (listed?.length) {
          // Compact maas.processes rows are already aggregated.
          if (procItem.key_ === 'maas.processes') {
            return listed
              .map((row) => ({
                name: row.name || 'unknown',
                instances: Number(row.instances) || 1,
                cpuPercent: Number(row.cpuPercent) || 0,
                memoryBytes: Number(row.memoryBytes ?? row.rss) || 0,
                status: row.status || 'running',
              }))
              .sort((a, b) => b.memoryBytes - a.memoryBytes)
              .slice(0, 50);
          }

          const byName: Record<
            string,
            {
              name: string;
              instances: number;
              cpuPercent: number;
              memoryBytes: number;
              status: string;
            }
          > = {};

          for (const proc of listed) {
            const name = (proc.name || '').trim();
            if (!name) continue;
            if (!byName[name]) {
              byName[name] = {
                name,
                instances: 0,
                cpuPercent: 0,
                memoryBytes: 0,
                status: 'running',
              };
            }
            const row = byName[name];
            row.instances += 1;
            row.memoryBytes += Number(proc.rss) || 0;
            row.cpuPercent += Number(proc.pmem) || 0;
            if (proc.state === 'running' || proc.state === 'R') {
              row.status = 'running';
            } else if (row.instances === 1) {
              row.status = proc.state || 'running';
            }
          }

          return Object.values(byName)
            .sort((a, b) => b.memoryBytes - a.memoryBytes)
            .slice(0, 50)
            .map((row) => ({
              ...row,
              cpuPercent: Number(row.cpuPercent.toFixed(2)),
            }));
        }
      } catch (error) {
        this.logger.debug(
          `proc list parse failed: ${(error as Error).message}`,
        );
      }
    }

    // Fallback: named proc.num / proc.cpu.util / proc.mem items
    const items = await this.rpc<
      Array<{ itemid: string; key_: string; lastvalue: string; lastclock: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      search: { key_: 'proc.' },
      searchWildcardsEnabled: false,
      output: ['itemid', 'key_', 'lastvalue', 'lastclock'],
    });

    const byName: Record<
      string,
      {
        name: string;
        instances: number;
        cpuPercent: number;
        memoryBytes: number;
        status: string;
      }
    > = {};

    for (const item of items) {
      const match = item.key_.match(/^proc\.(?:num|cpu\.util|mem)\[([^\],]+)/);
      if (!match) continue;
      const name = match[1];
      if (!byName[name]) {
        byName[name] = {
          name,
          instances: 0,
          cpuPercent: 0,
          memoryBytes: 0,
          status: 'running',
        };
      }
      const value = Number(item.lastvalue);
      if (item.key_.startsWith('proc.num[')) {
        byName[name].instances = Number.isFinite(value) ? value : 0;
        byName[name].status = value > 0 ? 'running' : 'stopped';
      } else if (item.key_.startsWith('proc.cpu.util[')) {
        byName[name].cpuPercent = Number.isFinite(value) ? value : 0;
      } else if (item.key_.startsWith('proc.mem[')) {
        byName[name].memoryBytes = Number.isFinite(value) ? value : 0;
      }
    }

    return Object.values(byName).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async ensureProcGetItem(hostId: string): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ key_: string }>>('item.get', {
      hostids: [hostId],
      filter: { key_: ['maas.processes', 'proc.get'] },
      output: ['key_'],
    });
    const existingKeys = new Set(existing.map((item) => item.key_));

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [hostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const agentInterface =
      interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
      interfaces.find((entry) => entry.type === '1');
    if (!agentInterface) return;

    // Prefer compact UserParameter (fits Zabbix 64KB text limit).
    if (!existingKeys.has('maas.processes')) {
      try {
        await this.rpc('item.create', {
          hostid: hostId,
          interfaceid: agentInterface.interfaceid,
          name: 'MAAS: Process summary',
          key_: 'maas.processes',
          type: 0,
          value_type: 4,
          delay: '1m',
          history: '7d',
          trends: '0',
        });
        this.logger.log(`Created maas.processes item for Zabbix host ${hostId}`);
      } catch (error) {
        this.logger.debug(
          `item.create maas.processes failed: ${(error as Error).message}`,
        );
      }
    }

    if (!existingKeys.has('proc.get')) {
      try {
        await this.rpc('item.create', {
          hostid: hostId,
          interfaceid: agentInterface.interfaceid,
          name: 'MAAS: Process list (proc.get)',
          key_: 'proc.get',
          type: 0,
          value_type: 4,
          delay: '1m',
          history: '7d',
          trends: '0',
        });
        this.logger.log(`Created proc.get item for Zabbix host ${hostId}`);
      } catch (error) {
        this.logger.debug(
          `item.create proc.get failed: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Parse a JSON array, repairing values truncated at Zabbix's 64KB text limit. */
  private parseJsonArrayLenient(raw: string): unknown[] | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      const lastComplete = raw.lastIndexOf('},');
      if (lastComplete < 0) return null;
      try {
        const repaired = `${raw.slice(0, lastComplete + 1)}]`;
        const parsed = JSON.parse(repaired) as unknown;
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }

  async getProcessTotal(zabbixHostId: string): Promise<number> {
    if (this.useMock()) return 142;

    const items = await this.rpc<Array<{ lastvalue: string }>>('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: ['proc.num'] },
      output: ['lastvalue'],
      limit: 1,
    });
    return Number(items[0]?.lastvalue ?? 0) || 0;
  }

  async getListeningPorts(
    zabbixHostId: string,
    serverIp?: string,
  ): Promise<
    Array<{
      name: string;
      port: number;
      status: 'UP' | 'DOWN' | 'UNKNOWN';
      responseTimeMs: number | null;
      lastChecked: string | null;
    }>
  > {
    type ServiceRow = {
      name: string;
      port: number;
      status: 'UP' | 'DOWN' | 'UNKNOWN';
      responseTimeMs: number | null;
      lastChecked: string | null;
    };

    if (this.useMock()) {
      return [
        {
          name: this.serviceDisplayName(22, 'sshd'),
          port: 22,
          status: 'UP',
          responseTimeMs: null,
          lastChecked: new Date().toISOString(),
        },
        {
          name: this.serviceDisplayName(80, 'nginx'),
          port: 80,
          status: 'UP',
          responseTimeMs: null,
          lastChecked: new Date().toISOString(),
        },
        {
          name: this.serviceDisplayName(5432, 'postgres'),
          port: 5432,
          status: 'UP',
          responseTimeMs: null,
          lastChecked: new Date().toISOString(),
        },
      ];
    }

    try {
      await this.ensureServiceItems(zabbixHostId, serverIp);
    } catch (error) {
      this.logger.debug(
        `ensureServiceItems skipped: ${(error as Error).message}`,
      );
    }

    const results: ServiceRow[] = [];

    // Prefer agent discovery (maas.services UserParameter).
    const discovered = await this.rpc<
      Array<{ lastvalue: string; lastclock: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: ['maas.services'] },
      output: ['lastvalue', 'lastclock'],
      limit: 1,
    });
    const discoveredRaw = discovered[0]?.lastvalue?.trim() ?? '';
    const discoveredClock = Number(discovered[0]?.lastclock ?? 0);
    if (discoveredRaw && discoveredRaw !== '[]' && discoveredClock > 0) {
      const rows = this.parseJsonArrayLenient(discoveredRaw) ?? [];
      const seen = new Set<number>();
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const port = Number(rec.port);
        if (!Number.isFinite(port) || port <= 0 || seen.has(port)) continue;
        seen.add(port);
        const process =
          typeof rec.process === 'string'
            ? rec.process
            : typeof rec.name === 'string'
              ? rec.name
              : '';
        results.push({
          name: this.serviceDisplayName(port, process),
          port,
          status: 'UP',
          responseTimeMs: null,
          lastChecked: new Date(discoveredClock * 1000).toISOString(),
        });
      }
      results.sort((a, b) => a.port - b.port);
    }

    // Legacy fallback: fixed port probes for hosts without UserParameter yet.
    if (results.length === 0) {
      const items = await this.rpc<
        Array<{ key_: string; lastvalue: string; lastclock: string }>
      >('item.get', {
        hostids: [zabbixHostId],
        search: { key_: 'net.tcp.' },
        output: ['key_', 'lastvalue', 'lastclock'],
      });

      const portState = new Map<
        number,
        { value?: string; clock?: string; perf?: string }
      >();
      for (const item of items) {
        const portMatch = item.key_.match(/^net\.tcp\.port\[[^,\]]*,(\d+)\]$/);
        const perfMatch = item.key_.match(
          /^net\.tcp\.service\.perf\[tcp,[^,\]]*,(\d+)\]$/,
        );
        const listenMatch = item.key_.match(/^net\.tcp\.listen\[(\d+)\]$/);
        const port = Number(
          portMatch?.[1] ?? perfMatch?.[1] ?? listenMatch?.[1] ?? NaN,
        );
        if (!Number.isFinite(port)) continue;
        const entry = portState.get(port) ?? {};
        if (perfMatch) {
          entry.perf = item.lastvalue;
        } else {
          entry.value = item.lastvalue;
          entry.clock = item.lastclock;
        }
        portState.set(port, entry);
      }

      for (const port of LEGACY_PROBE_PORTS) {
        const state = portState.get(port);
        const name = this.serviceDisplayName(port);
        const collectedAt = Number(state?.clock ?? 0);
        if (
          !state ||
          state.value == null ||
          state.value === '' ||
          !collectedAt
        ) {
          continue;
        }
        const isUp = state.value === '1';
        // Only show ports that were actually listening — avoid filling the
        // tab with DOWN rows from the old static probe list.
        if (!isUp) continue;
        const perfSeconds = Number(state.perf);
        results.push({
          name,
          port,
          status: 'UP',
          responseTimeMs:
            Number.isFinite(perfSeconds) && perfSeconds > 0
              ? Math.round(perfSeconds * 1000)
              : null,
          lastChecked: state.clock
            ? new Date(Number(state.clock) * 1000).toISOString()
            : null,
        });
      }
    }

    // Web scenarios (HTTP checks) for this host
    try {
      const httptests = await this.rpc<
        Array<{ httptestid: string; name: string }>
      >('httptest.get', {
        hostids: [zabbixHostId],
        output: ['httptestid', 'name'],
        selectSteps: ['name', 'status_codes'],
      });

      for (const test of httptests) {
        const items = await this.rpc<
          Array<{ key_: string; lastvalue: string; lastclock: string }>
        >('item.get', {
          hostids: [zabbixHostId],
          search: { key_: `web.test.time[${test.name}` },
          output: ['key_', 'lastvalue', 'lastclock'],
          searchWildcardsEnabled: true,
          limit: 1,
        });
        const failItems = await this.rpc<
          Array<{ lastvalue: string; lastclock: string }>
        >('item.get', {
          hostids: [zabbixHostId],
          search: { key_: `web.test.fail[${test.name}]` },
          output: ['lastvalue', 'lastclock'],
          limit: 1,
        });
        const failed = failItems[0]?.lastvalue === '1';
        const responseTimeMs = items[0]
          ? Math.round(Number(items[0].lastvalue) * 1000)
          : null;
        const clock = items[0]?.lastclock ?? failItems[0]?.lastclock;
        results.push({
          name: test.name,
          port: 0,
          status: (failed ? 'DOWN' : items.length ? 'UP' : 'UNKNOWN') as
            | 'UP'
            | 'DOWN'
            | 'UNKNOWN',
          responseTimeMs:
            responseTimeMs !== null && Number.isFinite(responseTimeMs)
              ? responseTimeMs
              : null,
          lastChecked: clock
            ? new Date(Number(clock) * 1000).toISOString()
            : null,
        });
      }
    } catch (error) {
      this.logger.debug(
        `httptest.get skipped: ${(error as Error).message}`,
      );
    }

    return results;
  }

  /**
   * Ensures the maas.docker.containers UserParameter item exists.
   * Classic zabbix-agent does not support docker.container_stats[*] — CPU/RAM
   * come from the UserParameter JSON instead.
   */
  async ensureDockerItems(
    hostId: string,
    _containerNames: string[] = [],
  ): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ key_: string }>>('item.get', {
      hostids: [hostId],
      search: { key_: 'docker' },
      searchWildcardsEnabled: false,
      output: ['key_'],
    });
    const existingKeys = new Set(existing.map((item) => item.key_));

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [hostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const agentInterface =
      interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
      interfaces.find((entry) => entry.type === '1');
    if (!agentInterface) return;

    if (existingKeys.has('maas.docker.containers')) return;

    try {
      await this.rpc('item.create', {
        hostid: hostId,
        interfaceid: agentInterface.interfaceid,
        name: 'MAAS: Docker containers (UserParameter)',
        key_: 'maas.docker.containers',
        type: 0,
        value_type: 4, // text
        delay: '1m',
        history: '7d',
        trends: '0',
      });
      this.logger.log(
        `Created maas.docker.containers item for Zabbix host ${hostId}`,
      );
    } catch (error) {
      this.logger.debug(
        `item.create maas.docker.containers failed: ${(error as Error).message}`,
      );
    }
  }

  async getDockerContainers(zabbixHostId: string): Promise<{
    available: boolean;
    containers: Array<{
      name: string;
      image: string;
      status: string;
      cpuPercent: number;
      memoryUsed: number;
      memoryLimit: number;
      uptime: string;
    }>;
  }> {
    if (this.useMock()) {
      return {
        available: true,
        containers: [
          {
            name: 'maas-backend',
            image: 'finalproject-backend',
            status: 'running',
            cpuPercent: 0.5,
            memoryUsed: 245678900,
            memoryLimit: 1073741824,
            uptime: '2 hours',
          },
        ],
      };
    }

    try {
      try {
        await this.ensureDockerItems(zabbixHostId);
      } catch (error) {
        this.logger.debug(
          `ensureDockerItems skipped: ${(error as Error).message}`,
        );
      }

      const listItems = await this.rpc<
        Array<{
          key_: string;
          lastvalue: string;
          lastclock: string;
          error?: string;
          state?: string;
        }>
      >('item.get', {
        hostids: [zabbixHostId],
        filter: {
          key_: ['maas.docker.containers', 'docker.containers'],
        },
        output: ['key_', 'lastvalue', 'lastclock', 'error', 'state'],
      });

      const usable = listItems
        .filter((item) => {
          const err = `${item.error || ''} ${item.lastvalue || ''}`.toUpperCase();
          return (
            item.state !== '1' &&
            !err.includes('NOTSUPPORTED') &&
            !err.includes('UNSUPPORTED') &&
            !err.includes('PERMISSION DENIED')
          );
        })
        .sort((a, b) => {
          const aMaas = a.key_ === 'maas.docker.containers' ? 1 : 0;
          const bMaas = b.key_ === 'maas.docker.containers' ? 1 : 0;
          if (bMaas !== aMaas) return bMaas - aMaas;
          return Number(b.lastclock || 0) - Number(a.lastclock || 0);
        });

      if (!usable.length) {
        return { available: false, containers: [] };
      }

      const listItem = usable[0];
      if (!Number(listItem.lastclock) || !listItem.lastvalue) {
        return { available: true, containers: [] };
      }

      type DockerListEntry = {
        Names?: string[] | string;
        Image?: string;
        State?: string;
        Status?: string;
        cpuPercent?: number | string;
        memoryUsed?: number | string;
        memoryLimit?: number | string;
        CPUPerc?: string;
        MemUsage?: string;
      };

      let listed: DockerListEntry[] = [];
      try {
        listed = JSON.parse(listItem.lastvalue) as DockerListEntry[];
        if (!Array.isArray(listed)) listed = [];
      } catch {
        return { available: true, containers: [] };
      }

      const containers = listed.map((entry) => {
        const rawName = Array.isArray(entry.Names)
          ? entry.Names[0] || ''
          : entry.Names || '';
        const name = String(rawName).replace(/^\/+/, '') || 'unknown';

        let cpuPercent = Number(entry.cpuPercent);
        if (!Number.isFinite(cpuPercent) && entry.CPUPerc) {
          cpuPercent = Number(String(entry.CPUPerc).replace('%', ''));
        }
        if (!Number.isFinite(cpuPercent)) cpuPercent = 0;

        let memoryUsed = Number(entry.memoryUsed);
        let memoryLimit = Number(entry.memoryLimit);
        if (
          (!Number.isFinite(memoryUsed) || !Number.isFinite(memoryLimit)) &&
          entry.MemUsage
        ) {
          const parts = String(entry.MemUsage).split('/');
          memoryUsed = this.parseDockerByteSize(parts[0]?.trim() ?? '');
          memoryLimit = this.parseDockerByteSize(parts[1]?.trim() ?? '');
        }
        if (!Number.isFinite(memoryUsed)) memoryUsed = 0;
        if (!Number.isFinite(memoryLimit)) memoryLimit = 0;

        return {
          name,
          image: entry.Image || '',
          status: (entry.State || 'unknown').toLowerCase(),
          cpuPercent: Number(cpuPercent.toFixed(2)),
          memoryUsed,
          memoryLimit,
          uptime: entry.Status || '—',
        };
      });

      return {
        available: true,
        containers: containers.sort((a, b) => a.name.localeCompare(b.name)),
      };
    } catch {
      return { available: false, containers: [] };
    }
  }

  /** Parse docker stats sizes like "45.2MiB" / "1.2GiB". */
  private parseDockerByteSize(text: string): number {
    const match = text
      .trim()
      .match(/^([0-9.]+)\s*([KMGTPE]?i?B)$/i);
    if (!match) return 0;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return 0;
    const unit = match[2].toUpperCase();
    const mult: Record<string, number> = {
      B: 1,
      KB: 1000,
      MB: 1000 ** 2,
      GB: 1000 ** 3,
      TB: 1000 ** 4,
      KIB: 1024,
      MIB: 1024 ** 2,
      GIB: 1024 ** 3,
      TIB: 1024 ** 4,
    };
    return Math.round(n * (mult[unit] ?? 1));
  }

  async getNetworkRates(zabbixHostId: string): Promise<{
    bytesInPerSec: number;
    bytesOutPerSec: number;
  }> {
    if (this.useMock()) {
      return { bytesInPerSec: 125000, bytesOutPerSec: 84000 };
    }

    const [inItem, outItem] = await Promise.all([
      this.findPrimaryNetIfItem(zabbixHostId, 'in'),
      this.findPrimaryNetIfItem(zabbixHostId, 'out'),
    ]);

    // Template Linux items are typically bits/s; expose as bytes/s for MAAS KPI.
    const bitsIn = Number(inItem?.lastvalue ?? 0) || 0;
    const bitsOut = Number(outItem?.lastvalue ?? 0) || 0;

    return {
      bytesInPerSec: bitsIn / 8,
      bytesOutPerSec: bitsOut / 8,
    };
  }

  /**
   * Aggregates everything the Zabbix agent reports for a host: system/kernel
   * facts, per-interface network counters, and mounted filesystems.
   */
  async getSystemInfo(zabbixHostId: string): Promise<{
    system: Record<string, string | number | null>;
    interfaces: Array<{
      name: string;
      bitsInPerSec: number;
      bitsOutPerSec: number;
      inErrors: number;
      outErrors: number;
      inDropped: number;
      outDropped: number;
    }>;
    filesystems: Array<{
      mount: string;
      fstype: string;
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usedPercent: number;
      inodesFreePercent: number | null;
    }>;
    lastUpdated: string;
  }> {
    if (this.useMock()) {
      return {
        system: {
          cpuCount: 4,
          load1: 0.42,
          load5: 0.51,
          load15: 0.6,
          contextSwitches: 5400,
          interrupts: 6700,
          kernelMaxFiles: 9223372036854776000,
          kernelMaxProc: 4194304,
          agentVersion: '6.4.0-mock',
          agentHostname: 'mock-host',
          memTotalBytes: 10721841152,
          memAvailableBytes: 4208271360,
          memUtilization: 60.7,
          swapFreePercent: 100,
          processes: 142,
          runningProcesses: 2,
        },
        interfaces: [
          {
            name: 'eth0',
            bitsInPerSec: 6520,
            bitsOutPerSec: 10904,
            inErrors: 0,
            outErrors: 0,
            inDropped: 0,
            outDropped: 0,
          },
        ],
        filesystems: [
          {
            mount: '/',
            fstype: 'overlay',
            totalBytes: 83952558080,
            usedBytes: 51026026496,
            freeBytes: 28614946816,
            usedPercent: 64.07,
            inodesFreePercent: 68.26,
          },
        ],
        lastUpdated: new Date().toISOString(),
      };
    }

    const items = await this.rpc<
      Array<{ key_: string; lastvalue: string; lastclock: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      output: ['key_', 'lastvalue', 'lastclock'],
    });

    const byKey = new Map<string, string>();
    for (const item of items) byKey.set(item.key_, item.lastvalue);
    const num = (key: string): number | null => {
      const v = byKey.get(key);
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const system: Record<string, string | number | null> = {
      cpuCount: num('system.cpu.num'),
      load1: num('system.cpu.load[all,avg1]'),
      load5: num('system.cpu.load[all,avg5]'),
      load15: num('system.cpu.load[all,avg15]'),
      contextSwitches: num('system.cpu.switches'),
      interrupts: num('system.cpu.intr'),
      kernelMaxFiles: num('kernel.maxfiles'),
      kernelMaxProc: num('kernel.maxproc'),
      agentVersion: byKey.get('agent.version') ?? null,
      agentHostname: byKey.get('agent.hostname') ?? null,
      memTotalBytes: num('vm.memory.size[total]'),
      memAvailableBytes: num('vm.memory.size[available]'),
      memUtilization: num('vm.memory.utilization'),
      swapFreePercent: num('system.swap.size[,pfree]'),
      processes: num('proc.num'),
      runningProcesses: num('proc.num[,,run]'),
    };

    // Network interfaces — group by name parsed from net.if.in["eth0",...]
    const ifaceMap: Record<
      string,
      {
        name: string;
        bitsInPerSec: number;
        bitsOutPerSec: number;
        inErrors: number;
        outErrors: number;
        inDropped: number;
        outDropped: number;
      }
    > = {};
    for (const item of items) {
      const match = item.key_.match(/^net\.if\.(in|out)\["([^"]+)"(?:,(\w+))?\]/);
      if (!match) continue;
      const [, dir, name, modifier] = match;
      if (!ifaceMap[name]) {
        ifaceMap[name] = {
          name,
          bitsInPerSec: 0,
          bitsOutPerSec: 0,
          inErrors: 0,
          outErrors: 0,
          inDropped: 0,
          outDropped: 0,
        };
      }
      const value = Number(item.lastvalue);
      if (!Number.isFinite(value)) continue;
      if (!modifier) {
        if (dir === 'in') ifaceMap[name].bitsInPerSec = value;
        else ifaceMap[name].bitsOutPerSec = value;
      } else if (modifier === 'errors') {
        if (dir === 'in') ifaceMap[name].inErrors = value;
        else ifaceMap[name].outErrors = value;
      } else if (modifier === 'dropped') {
        if (dir === 'in') ifaceMap[name].inDropped = value;
        else ifaceMap[name].outDropped = value;
      }
    }

    // Filesystems — parse each `vfs.fs.dependent[<mount>,data]` JSON blob.
    // The agent commonly exposes the root overlay through several bind mounts
    // (e.g. /etc/hostname); collapse identical devices and relabel to "/".
    const filesystems: Array<{
      mount: string;
      fstype: string;
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usedPercent: number;
      inodesFreePercent: number | null;
    }> = [];
    const seenSignatures = new Set<string>();
    for (const item of items) {
      const match = item.key_.match(/^vfs\.fs\.dependent\[(.+),data\]$/);
      if (!match || !item.lastvalue) continue;
      try {
        const fs = JSON.parse(item.lastvalue) as {
          fsname?: string;
          fstype?: string;
          bytes?: { total?: number; used?: number; free?: number; pused?: number };
          inodes?: { pfree?: number };
        };
        const total = fs.bytes?.total ?? 0;
        const used = fs.bytes?.used ?? 0;
        if (!total) continue;
        const signature = `${total}-${used}-${fs.fstype ?? ''}`;
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        let mount = fs.fsname ?? match[1];
        // Bind-mount noise for the root device -> present as the root mount.
        if (/^\/etc\//.test(mount)) mount = '/';
        filesystems.push({
          mount,
          fstype: fs.fstype ?? '',
          totalBytes: total,
          usedBytes: used,
          freeBytes: fs.bytes?.free ?? 0,
          usedPercent: Number((fs.bytes?.pused ?? 0).toFixed(2)),
          inodesFreePercent:
            typeof fs.inodes?.pfree === 'number'
              ? Number(fs.inodes.pfree.toFixed(2))
              : null,
        });
      } catch {
        // skip malformed entries
      }
    }

    return {
      system,
      interfaces: Object.values(ifaceMap).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      filesystems: filesystems.sort((a, b) => a.mount.localeCompare(b.mount)),
      lastUpdated: new Date().toISOString(),
    };
  }

  // ── Network discovery ────────────────────────────

  async getDiscoveredHosts(): Promise<any[]> {
    if (this.useMock()) return [];
    return this.rpc<any[]>('host.get', {
      output: [
        'hostid',
        'host',
        'name',
        'available',
        'snmp_available',
        'lastaccess',
        'description',
      ],
      selectInterfaces: ['ip', 'type', 'port', 'available'],
      selectGroups: ['groupid', 'name'],
      selectTags: ['tag', 'value'],
      selectItems: ['key_', 'lastvalue', 'lastclock'],
    });
  }

  async getHostsByGroup(groupName: string): Promise<any[]> {
    if (this.useMock()) return [];
    const groups = await this.rpc<any[]>('hostgroup.get', {
      output: ['groupid', 'name'],
      filter: { name: [groupName] },
    });
    if (!groups.length) return [];

    return this.rpc<any[]>('host.get', {
      output: [
        'hostid',
        'host',
        'name',
        'available',
        'snmp_available',
        'lastaccess',
        'description',
      ],
      selectInterfaces: ['ip', 'type', 'port', 'available', 'interfaceid'],
      selectGroups: ['groupid', 'name'],
      selectItems: ['key_', 'lastvalue', 'lastclock'],
      groupids: [groups[0].groupid],
    });
  }

  /**
   * Ensures icmpping (+ response time) simple-check items exist so network
   * device status can be UP/DOWN without an SNMP or agent template.
   */
  async ensureIcmpPingItems(zabbixHostId: string): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ key_: string }>>('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: ['icmpping', 'icmppingsec'] },
      output: ['key_'],
    });
    const keys = new Set(existing.map((item) => item.key_));
    if (keys.has('icmpping') && keys.has('icmppingsec')) return;

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [zabbixHostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const iface =
      interfaces.find((entry) => entry.main === '1') ?? interfaces[0];
    if (!iface) return;

    if (!keys.has('icmpping')) {
      try {
        await this.rpc('item.create', {
          hostid: zabbixHostId,
          interfaceid: iface.interfaceid,
          name: 'ICMP ping',
          key_: 'icmpping',
          type: 3, // simple check
          value_type: 3,
          delay: '1m',
          history: '7d',
          trends: '90d',
        });
      } catch (error) {
        this.logger.debug(
          `icmpping create failed for ${zabbixHostId}: ${(error as Error).message}`,
        );
      }
    }

    if (!keys.has('icmppingsec')) {
      try {
        await this.rpc('item.create', {
          hostid: zabbixHostId,
          interfaceid: iface.interfaceid,
          name: 'ICMP response time',
          key_: 'icmppingsec',
          type: 3,
          value_type: 0,
          units: 's',
          delay: '1m',
          history: '7d',
          trends: '90d',
        });
      } catch (error) {
        this.logger.debug(
          `icmppingsec create failed for ${zabbixHostId}: ${(error as Error).message}`,
        );
      }
    }
  }

  async getIcmpPingStatus(
    zabbixHostId: string,
  ): Promise<{ status: 'UP' | 'DOWN' | 'UNKNOWN'; lastClock: number }> {
    if (this.useMock()) {
      return { status: 'UP', lastClock: Math.floor(Date.now() / 1000) };
    }

    const items = await this.rpc<
      Array<{ key_: string; lastvalue: string; lastclock: string }>
    >('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: ['icmpping', 'agent.ping'] },
      output: ['key_', 'lastvalue', 'lastclock'],
    });

    const ping =
      items.find((item) => item.key_ === 'icmpping') ??
      items.find((item) => item.key_ === 'agent.ping');
    const clock = Number(ping?.lastclock ?? 0);
    if (!ping || !clock) {
      return { status: 'UNKNOWN', lastClock: 0 };
    }
    return {
      status: ping.lastvalue === '1' ? 'UP' : 'DOWN',
      lastClock: clock,
    };
  }

  async pingHost(ip: string): Promise<{
    reachable: boolean;
    responseTimeMs: number | null;
  }> {
    if (this.useMock()) {
      return { reachable: false, responseTimeMs: null };
    }
    try {
      const hosts = await this.rpc<any[]>('host.get', {
        output: ['hostid'],
        filter: { host: [ip] },
        selectInterfaces: ['ip'],
      });
      const host = hosts.find(
        (entry) =>
          entry.host === ip ||
          entry.interfaces?.some(
            (iface: { ip?: string }) => iface.ip === ip,
          ),
      );
      if (!host) return { reachable: false, responseTimeMs: null };

      const items = await this.rpc<any[]>('item.get', {
        hostids: [host.hostid],
        output: ['key_', 'lastvalue', 'lastclock'],
        filter: { key_: ['icmpping', 'icmppingsec'] },
      });
      const ping = items.find((item) => item.key_ === 'icmpping');
      const pingTime = items.find((item) => item.key_ === 'icmppingsec');
      const seconds = Number(pingTime?.lastvalue);
      return {
        reachable: ping?.lastvalue === '1',
        responseTimeMs:
          Number.isFinite(seconds) && seconds >= 0
            ? Math.round(seconds * 1000)
            : null,
      };
    } catch {
      return { reachable: false, responseTimeMs: null };
    }
  }

  async getSnmpData(zabbixHostId: string): Promise<{
    description: string | null;
    systemName: string | null;
    location: string | null;
    uptime: number | null;
    interfaces: any[];
    bandwidth: any[];
  }> {
    if (this.useMock()) {
      return {
        description: null,
        systemName: null,
        location: null,
        uptime: null,
        interfaces: [],
        bandwidth: [],
      };
    }

    const items = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['itemid', 'key_', 'lastvalue', 'lastclock', 'name'],
      search: { key_: 'sysDescr' },
    });
    const systemNameItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['lastvalue'],
      search: { key_: 'sysName' },
    });
    const locationItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['lastvalue'],
      search: { key_: 'sysLocation' },
    });
    const uptimeItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['lastvalue'],
      search: { key_: 'sysUpTime' },
    });
    const ifItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['key_', 'lastvalue', 'name'],
      search: { key_: 'ifOperStatus' },
      searchWildcardsEnabled: true,
    });
    const inItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['key_', 'lastvalue', 'name'],
      search: { key_: 'ifInOctets' },
      searchWildcardsEnabled: true,
    });
    const outItems = await this.rpc<any[]>('item.get', {
      hostids: [zabbixHostId],
      output: ['key_', 'lastvalue', 'name'],
      search: { key_: 'ifOutOctets' },
      searchWildcardsEnabled: true,
    });

    const interfaceId = (key: string) =>
      key.match(/\[([^\]]+)\]/)?.[1] ?? key;
    const bandwidth = new Map<
      string,
      { key: string; name: string; bytesIn: number; bytesOut: number }
    >();
    for (const item of inItems) {
      const id = interfaceId(item.key_);
      bandwidth.set(id, {
        key: id,
        name: item.name,
        bytesIn: Number(item.lastvalue) || 0,
        bytesOut: 0,
      });
    }
    for (const item of outItems) {
      const id = interfaceId(item.key_);
      const entry = bandwidth.get(id) ?? {
        key: id,
        name: item.name,
        bytesIn: 0,
        bytesOut: 0,
      };
      entry.bytesOut = Number(item.lastvalue) || 0;
      bandwidth.set(id, entry);
    }

    return {
      description: items[0]?.lastvalue ?? null,
      systemName: systemNameItems[0]?.lastvalue ?? null,
      location: locationItems[0]?.lastvalue ?? null,
      uptime: uptimeItems[0] ? Number(uptimeItems[0].lastvalue) || null : null,
      interfaces: ifItems.map((item) => ({
        key: interfaceId(item.key_),
        name: item.name,
        status: item.lastvalue === '1' ? 'UP' : 'DOWN',
      })),
      bandwidth: Array.from(bandwidth.values()),
    };
  }

  async createDiscoveryRule(params: {
    name: string;
    ipRange: string;
    snmpCommunity: string;
    /** ICMP-only sweeps finish in minutes; SNMP on a /24 can take hours. */
    icmpOnly?: boolean;
    /** Discovery interval (Zabbix delay). Default 1h; auto-onboard uses 1m. */
    delay?: string;
  }): Promise<string> {
    const dchecks: Array<Record<string, unknown>> = [
      { type: 12, uniq: 0 }, // ICMP ping
    ];
    if (!params.icmpOnly) {
      dchecks.push({
        // Zabbix discovery service type 11 is SNMPv2c.
        type: 11,
        key_: '.1.3.6.1.2.1.1.1.0',
        snmp_community: params.snmpCommunity,
        ports: '161',
        uniq: 0,
      });
    }

    const result = await this.rpc<{ druleids: string[] }>('drule.create', {
      name: params.name,
      iprange: params.ipRange,
      delay: params.delay ?? '1h',
      dchecks,
      status: 0,
    });
    return result.druleids[0];
  }

  async getDiscoveryRules(): Promise<any[]> {
    if (this.useMock()) return [];
    return this.rpc<any[]>('drule.get', {
      output: ['druleid', 'name', 'iprange', 'delay', 'status', 'nextcheck'],
      selectDChecks: ['type', 'key_', 'ports'],
    });
  }

  async rpcDeleteDiscoveryRule(druleId: string): Promise<void> {
    if (this.useMock()) return;
    await this.rpc('drule.delete', [druleId]);
  }

  /**
   * Disable every enabled discovery rule whose IP range is not `keepIpRange`.
   * Keeps the active LAN rule from competing with stale ranges.
   */
  async disableOtherDiscoveryRules(keepIpRange: string): Promise<number> {
    if (this.useMock()) return 0;
    const rules = await this.getDiscoveryRules();
    let disabled = 0;
    for (const rule of rules) {
      if (String(rule.status) !== '0') continue;
      if (rule.iprange === keepIpRange) continue;
      try {
        await this.rpc('drule.update', {
          druleid: rule.druleid,
          status: 1,
        });
        disabled += 1;
        this.logger.log(
          `Disabled stale discovery rule ${rule.druleid} (${rule.name})`,
        );
      } catch (error) {
        this.logger.debug(
          `disable rule ${rule.druleid} failed: ${(error as Error).message}`,
        );
      }
    }
    return disabled;
  }

  /**
   * Move ICMP-discovered hosts on this server's subnet into its network group.
   * Runs after auto-scan because Zabbix discovery completes asynchronously.
   */
  async syncDiscoveredHostsToServerGroup(
    serverId: string,
    networkPrefix: string,
  ): Promise<number> {
    if (this.useMock()) return 0;

    const groupId = await this.getOrCreateGroup(
      this.serverNetworkGroupName(serverId),
    );
    let synced = 0;

    for (const sourceGroup of ['Discovered devices', 'Network devices']) {
      const hosts = await this.getHostsByGroup(sourceGroup);
      for (const host of hosts) {
        const ip =
          host.interfaces?.find((entry: { ip?: string }) => entry.ip)?.ip ?? '';
        if (!ip || !ip.startsWith(networkPrefix)) continue;

        try {
          await this.rpc('hostgroup.massadd', {
            groups: [{ groupid: groupId }],
            hosts: [{ hostid: host.hostid }],
          });
          await this.ensureIcmpPingItems(host.hostid);
          synced += 1;
        } catch (error) {
          this.logger.debug(
            `sync host ${host.hostid} to ${serverId}: ${(error as Error).message}`,
          );
        }
      }
    }

    if (synced > 0) {
      this.logger.log(
        `Synced ${synced} network host(s) into MAAS Network: ${serverId}`,
      );
    }
    return synced;
  }

  /**
   * Force a discovery cycle. Zabbix 6.4 removed writable nextcheck, so we
   * shorten delay, toggle enable/disable, and re-enable the rule.
   */
  async scanNetworkNow(druleId: string): Promise<void> {
    if (this.useMock()) return;

    try {
      await this.rpc('drule.update', {
        druleid: druleId,
        nextcheck: 0,
      });
      return;
    } catch {
      // expected on 6.4+
    }

    try {
      await this.rpc('drule.update', {
        druleid: druleId,
        status: 0,
        delay: '1m',
      });
      await this.rpc('drule.update', { druleid: druleId, status: 1 });
      await this.rpc('drule.update', {
        druleid: druleId,
        status: 0,
        delay: '1m',
      });
    } catch (error) {
      this.logger.warn(
        `scanNetworkNow(${druleId}) failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Ensure a fast ICMP-only rule exists for the range (replace slow SNMP rules).
   */
  async ensureFastIcmpDiscoveryRule(params: {
    name: string;
    ipRange: string;
  }): Promise<string> {
    if (this.useMock()) return `mock-drule-${Date.now()}`;

    const rules = await this.getDiscoveryRules();
    const existing = rules.find(
      (rule: { iprange?: string }) => rule.iprange === params.ipRange,
    );

    if (existing?.druleid) {
      const checks = (existing.dchecks ?? []) as Array<{ type?: string }>;
      const hasSnmp = checks.some((check) => String(check.type) === '11');
      const delay = String(existing.delay ?? '');
      const needsReplace = hasSnmp || (delay !== '1m' && delay !== '30s');

      if (needsReplace) {
        this.logger.log(
          `Replacing slow discovery rule ${existing.druleid} (${existing.name}) with ICMP-only 1m rule`,
        );
        try {
          await this.rpc('drule.delete', [existing.druleid]);
        } catch (error) {
          this.logger.warn(
            `drule.delete ${existing.druleid} failed: ${(error as Error).message}`,
          );
        }
      } else {
        await this.rpc('drule.update', {
          druleid: existing.druleid,
          status: 0,
          name: params.name,
          delay: '1m',
        });
        return String(existing.druleid);
      }
    }

    return this.createDiscoveryRule({
      name: params.name,
      ipRange: params.ipRange,
      snmpCommunity: 'public',
      icmpOnly: true,
      delay: '1m',
    });
  }

  private mockSeries(from: Date, to: Date, metric: MetricKind): MetricPoint[] {
    const points: MetricPoint[] = [];
    const step = Math.max(60000, (to.getTime() - from.getTime()) / 48);
    const base =
      metric === 'cpu'
        ? 40
        : metric === 'memory'
          ? 60
          : metric === 'disk'
            ? 45
            : 20;
    for (let t = from.getTime(); t <= to.getTime(); t += step) {
      const wave = Math.sin(t / 3600000) * 15;
      points.push({
        timestamp: new Date(t).toISOString(),
        value: Number(Math.max(0, Math.min(100, base + wave)).toFixed(1)),
      });
    }
    return points;
  }

  async createHostWithPSK(params: {
    hostname: string;
    groupId: string;
    templateId: string;
    pskIdentity: string;
    pskKey: string;
  }): Promise<string> {
    if (this.useMock()) {
      const id = `mock-host-psk-${Date.now()}`;
      this.logger.log(
        `[mock] createHostWithPSK ${params.hostname} → ${id}`,
      );
      return id;
    }

    const groupIds = [{ groupid: params.groupId }];
    const linuxGroupId = await this.resolveLinuxServersGroupId();
    if (linuxGroupId && linuxGroupId !== params.groupId) {
      groupIds.push({ groupid: linuxGroupId });
    }

    const result = await this.rpc<{ hostids: string[] }>('host.create', {
      host: params.hostname,
      name: params.hostname,
      // Placeholder interface — agent connects outward (active mode)
      interfaces: [
        {
          type: 1,
          main: 1,
          useip: 1,
          ip: '0.0.0.0',
          dns: '',
          port: '10050',
        },
      ],
      groups: groupIds,
      templates: [{ templateid: params.templateId }],
      tls_connect: 2, // PSK
      tls_accept: 2, // PSK
      tls_psk_identity: params.pskIdentity,
      tls_psk: params.pskKey,
    });
    const hostId = result.hostids[0];
    this.logger.log(
      `Created Zabbix host with PSK ${params.hostname} → ${hostId}`,
    );
    return hostId;
  }

  async updateHostname(
    zabbixHostId: string,
    newHostname: string,
    newIp: string,
  ): Promise<void> {
    if (this.useMock()) {
      this.logger.log(
        `[mock] updateHostname ${zabbixHostId} → ${newHostname} (${newIp})`,
      );
      return;
    }

    await this.rpc('host.update', {
      hostid: zabbixHostId,
      host: newHostname,
      name: newHostname,
    });

    const interfaces = await this.rpc<
      Array<{ interfaceid: string; main: string; type: string }>
    >('hostinterface.get', {
      hostids: [zabbixHostId],
      output: ['interfaceid', 'main', 'type'],
    });
    const agentInterface =
      interfaces.find((entry) => entry.type === '1' && entry.main === '1') ??
      interfaces.find((entry) => entry.type === '1');
    if (agentInterface) {
      await this.rpc('hostinterface.update', {
        interfaceid: agentInterface.interfaceid,
        ip: newIp,
        useip: 1,
        dns: '',
        port: '10050',
      });
    }

    this.logger.log(
      `Updated Zabbix host ${zabbixHostId} hostname=${newHostname} ip=${newIp}`,
    );
  }

  async checkAgentConnected(zabbixHostId: string): Promise<{
    connected: boolean;
    hostname: string | null;
    lastSeen: string | null;
  }> {
    if (this.useMock()) {
      return { connected: false, hostname: null, lastSeen: null };
    }

    // Zabbix 6.0+ moved agent availability from host.available to
    // host interface.available — host.available is no longer returned.
    const [host] = await this.rpc<
      Array<{
        hostid: string;
        host: string;
        lastaccess?: string;
        interfaces?: Array<{
          type: string;
          available: string;
          error?: string;
        }>;
      }>
    >('host.get', {
      hostids: [zabbixHostId],
      output: ['hostid', 'host', 'lastaccess'],
      selectInterfaces: ['type', 'available', 'error'],
    });
    if (!host) {
      return { connected: false, hostname: null, lastSeen: null };
    }

    const agentInterface =
      host.interfaces?.find((entry) => entry.type === '1') ??
      host.interfaces?.[0];
    const lastAccessNum = Number(host.lastaccess || 0);
    const interfaceUp = agentInterface?.available === '1';
    const connected = interfaceUp || lastAccessNum > 0;

    return {
      connected,
      hostname: host.host,
      lastSeen: lastAccessNum
        ? new Date(lastAccessNum * 1000).toISOString()
        : interfaceUp
          ? new Date().toISOString()
          : null,
    };
  }

  /**
   * Ensures a discovery action that auto-adds ICMP-discovered hosts.
   * Idempotent — safe to call on every server onboard.
   * @deprecated Prefer ensureServerNetworkDiscovery for per-server scoping.
   */
  async createDiscoveryAction(): Promise<void> {
    if (this.useMock()) return;

    const existing = await this.rpc<Array<{ actionid: string; name: string }>>(
      'action.get',
      {
        output: ['actionid', 'name'],
        filter: { name: ['MAAS Auto-add discovered devices'] },
      },
    );

    if (existing.length > 0) return;

    const groupId = await this.getOrCreateGroup('Discovered devices');
    const templateId = await this.resolveIcmpTemplateId();

    const operations: Array<Record<string, unknown>> = [
      { operationtype: 2 }, // add host
      {
        operationtype: 4, // add to host group
        opgroup: [{ groupid: groupId }],
      },
    ];

    if (templateId) {
      operations.push({
        operationtype: 6, // link to template
        optemplate: [{ templateid: templateId }],
      });
    }

    await this.rpc('action.create', {
      name: 'MAAS Auto-add discovered devices',
      eventsource: 1, // discovery events
      status: 0, // enabled
      filter: {
        evaltype: 0,
        conditions: [
          {
            conditiontype: 10, // discovery status
            operator: 0, // equals
            value: '2', // UP
          },
          {
            conditiontype: 8, // discovery check type
            operator: 0, // equals
            // Zabbix 6.4 ICMP ping dcheck type (matches createDiscoveryRule)
            value: '12',
          },
        ],
      },
      operations,
    });

    this.logger.log('Created discovery action: MAAS Auto-add discovered devices');
  }

  serverNetworkGroupName(serverId: string): string {
    return `MAAS Network: ${serverId}`;
  }

  private serverDiscoveryActionName(serverId: string): string {
    return `MAAS Network Action: ${serverId}`;
  }

  /**
   * Per-server discovery action: ICMP UP hosts from this rule land in the
   * server's network host group (not the global Discovered devices pool).
   */
  async ensureServerNetworkDiscovery(params: {
    serverId: string;
    ruleId: string;
  }): Promise<void> {
    if (this.useMock()) return;

    const groupId = await this.getOrCreateGroup(
      this.serverNetworkGroupName(params.serverId),
    );
    const actionName = this.serverDiscoveryActionName(params.serverId);

    const existing = await this.rpc<Array<{ actionid: string }>>('action.get', {
      output: ['actionid'],
      filter: { name: [actionName] },
    });

    const templateId = await this.resolveIcmpTemplateId();

    const operations: Array<Record<string, unknown>> = [
      { operationtype: 2 },
      {
        operationtype: 4,
        opgroup: [{ groupid: groupId }],
      },
    ];
    if (templateId) {
      operations.push({
        operationtype: 6,
        optemplate: [{ templateid: templateId }],
      });
    }

    const filter = {
      evaltype: 0,
      conditions: [
        {
          conditiontype: 10,
          operator: 0,
          value: '2',
        },
        {
          conditiontype: 8,
          operator: 0,
          value: '12',
        },
        {
          conditiontype: 18,
          operator: 0,
          value: params.ruleId,
        },
      ],
    };

    if (existing.length > 0) {
      await this.rpc('action.update', {
        actionid: existing[0].actionid,
        status: 0,
        filter,
        operations,
      });
      this.logger.log(
        `Updated per-server network discovery action for ${params.serverId}`,
      );
      return;
    }

    await this.rpc('action.create', {
      name: actionName,
      eventsource: 1,
      status: 0,
      filter,
      operations,
    });

    this.logger.log(
      `Created per-server network discovery action for ${params.serverId}`,
    );
  }

  /** Remove network devices, discovery rule/action, and host group for a server. */
  async cleanupServerNetwork(
    serverId: string,
    discoveryRuleId?: string | null,
  ): Promise<void> {
    if (this.useMock()) return;

    const groupName = this.serverNetworkGroupName(serverId);
    const groups = await this.rpc<Array<{ groupid: string }>>('hostgroup.get', {
      output: ['groupid'],
      filter: { name: [groupName] },
    });
    const groupId = groups[0]?.groupid;

    if (groupId) {
      const hosts = await this.rpc<
        Array<{ hostid: string; groups?: Array<{ groupid: string; name: string }> }>
      >('host.get', {
        output: ['hostid'],
        selectGroups: ['groupid', 'name'],
        groupids: [groupId],
      });

      for (const host of hosts) {
        const maasGroups = (host.groups ?? []).filter((entry) =>
          entry.name.startsWith('MAAS Network:'),
        );
        if (maasGroups.length <= 1) {
          try {
            await this.deleteHost(host.hostid);
          } catch (error) {
            this.logger.warn(
              `cleanupServerNetwork deleteHost ${host.hostid}: ${(error as Error).message}`,
            );
          }
        } else {
          try {
            await this.rpc('hostgroup.massremove', {
              groups: [{ groupid: groupId }],
              hosts: [{ hostid: host.hostid }],
            });
          } catch (error) {
            this.logger.warn(
              `cleanupServerNetwork massremove ${host.hostid}: ${(error as Error).message}`,
            );
          }
        }
      }

      try {
        await this.rpc('hostgroup.delete', [groupId]);
      } catch (error) {
        this.logger.debug(
          `hostgroup.delete ${groupId}: ${(error as Error).message}`,
        );
      }
    }

    const actionName = this.serverDiscoveryActionName(serverId);
    const actions = await this.rpc<Array<{ actionid: string }>>('action.get', {
      output: ['actionid'],
      filter: { name: [actionName] },
    });
    for (const action of actions) {
      try {
        await this.rpc('action.delete', [action.actionid]);
      } catch (error) {
        this.logger.debug(
          `action.delete ${action.actionid}: ${(error as Error).message}`,
        );
      }
    }

    if (discoveryRuleId) {
      const rulesStillLinked = await this.rpc<Array<{ druleid: string }>>(
        'drule.get',
        {
          output: ['druleid'],
          druleids: [discoveryRuleId],
        },
      );
      if (rulesStillLinked.length) {
        try {
          await this.rpc('drule.delete', [discoveryRuleId]);
        } catch (error) {
          this.logger.debug(
            `drule.delete ${discoveryRuleId}: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  private async getOrCreateGroup(name: string): Promise<string> {
    const groups = await this.rpc<Array<{ groupid: string }>>('hostgroup.get', {
      output: ['groupid'],
      filter: { name: [name] },
    });
    if (groups.length) return groups[0].groupid;

    const result = await this.rpc<{ groupids: string[] }>('hostgroup.create', {
      name,
    });
    return result.groupids[0];
  }

  /** Zabbix 6.4+ template groups are separate from host groups. */
  private async getOrCreateTemplateGroup(name: string): Promise<string> {
    const groups = await this.rpc<Array<{ groupid: string }>>(
      'templategroup.get',
      {
        output: ['groupid'],
        filter: { name: [name] },
      },
    );
    if (groups.length) return groups[0].groupid;

    const result = await this.rpc<{ groupids: string[] }>(
      'templategroup.create',
      { name },
    );
    return result.groupids[0];
  }

  private async getTemplateId(name: string): Promise<string> {
    const templates = await this.rpc<Array<{ templateid: string }>>(
      'template.get',
      {
        output: ['templateid'],
        filter: { name: [name] },
      },
    );
    if (templates.length) return templates[0].templateid;

    const byHost = await this.rpc<Array<{ templateid: string }>>(
      'template.get',
      {
        output: ['templateid'],
        filter: { host: [name] },
      },
    );
    if (byHost.length) return byHost[0].templateid;
    return '';
  }

  /** Best-effort ICMP template for discovery actions; optional if missing. */
  private async resolveIcmpTemplateId(): Promise<string | null> {
    const stock = await this.getTemplateId('Network devices by ICMP ping');
    if (stock) return stock;

    try {
      const created = await this.ensureMaasIcmpTemplate();
      return created || null;
    } catch (error) {
      this.logger.warn(
        `ICMP template unavailable: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Creates a minimal ICMP ping template when stock templates are missing. */
  private async ensureMaasIcmpTemplate(): Promise<string> {
    const existing = await this.getTemplateId('MAAS ICMP Ping');
    if (existing) return existing;

    const groupId = await this.getOrCreateTemplateGroup('Templates');

    const created = await this.rpc<{ templateids: string[] }>('template.create', {
      host: 'MAAS ICMP Ping',
      name: 'MAAS ICMP Ping',
      groups: [{ groupid: groupId }],
    });
    const templateId = created.templateids[0];

    try {
      await this.rpc('item.create', {
        hostid: templateId,
        name: 'ICMP ping',
        key_: 'icmpping',
        type: 3,
        value_type: 3,
        delay: '1m',
        history: '7d',
        trends: '90d',
      });
      await this.rpc('item.create', {
        hostid: templateId,
        name: 'ICMP response time',
        key_: 'icmppingsec',
        type: 3,
        value_type: 0,
        units: 's',
        delay: '1m',
        history: '7d',
        trends: '90d',
      });
    } catch (error) {
      this.logger.warn(
        `MAAS ICMP Ping template items failed: ${(error as Error).message}`,
      );
    }

    this.logger.log(`Created template MAAS ICMP Ping → ${templateId}`);
    return templateId;
  }

  // ── User watch triggers (MAAS "Focus on this") ─────────────────────────────

  private async getHostTechnicalName(hostId: string): Promise<string> {
    if (this.useMock()) return `mock-host-${hostId}`;

    const hosts = await this.rpc<Array<{ host: string }>>('host.get', {
      hostids: [hostId],
      output: ['host'],
      limit: 1,
    });
    if (!hosts.length) {
      throw new Error(`Zabbix host ${hostId} not found`);
    }
    return hosts[0].host;
  }

  private watchTriggerTags(params: {
    serverId: string;
    entityType: string;
    entityName: string;
    kind: 'down' | 'removed';
  }) {
    return [
      { tag: 'source', value: 'user-watch' },
      { tag: 'entity-type', value: params.entityType.toLowerCase() },
      { tag: 'entity-name', value: params.entityName },
      { tag: 'server-id', value: params.serverId },
      { tag: 'alert-kind', value: params.kind },
    ];
  }

  /** Build JS preprocessing that derives per-entity watch values from MAAS master items. */
  private watchPreprocessingScript(
    entityType: string,
    entityName: string,
    entityMeta?: Record<string, unknown>,
  ): string | null {
    const esc = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    if (entityType === 'CONTAINER') {
      const target = esc(entityName);
      return `var target = '${target}';\ntry {\n  var data = JSON.parse(value);\n  if (!Array.isArray(data)) return 'missing';\n  for (var i = 0; i < data.length; i++) {\n    var row = data[i];\n    var names = row.Names || [];\n    for (var j = 0; j < names.length; j++) {\n      var n = String(names[j]).replace(/^\\//, '');\n      if (n === target) {\n        var state = String(row.State || '').toLowerCase();\n        return state === 'running' ? 'running' : (state || 'stopped');\n      }\n    }\n  }\n  return 'missing';\n} catch (e) { return 'missing'; }`;
    }

    if (entityType === 'PROCESS') {
      const target = esc(entityName);
      return `var target = '${target}';\ntry {\n  var data = JSON.parse(value);\n  if (!Array.isArray(data)) return '0';\n  var count = 0;\n  for (var i = 0; i < data.length; i++) {\n    if (String(data[i].name || '') === target) {\n      count += Number(data[i].instances || 1);\n    }\n  }\n  return String(count);\n} catch (e) { return '0'; }`;
    }

    if (entityType === 'SERVICE') {
      const port = esc(String(entityMeta?.port ?? entityName));
      return `var target = '${port}';\ntry {\n  var data = JSON.parse(value);\n  if (!Array.isArray(data)) return '0';\n  for (var i = 0; i < data.length; i++) {\n    if (String(data[i].port) === target) return '1';\n  }\n  return '0';\n} catch (e) { return '0'; }`;
    }

    return null;
  }

  private masterItemKeyForWatch(entityType: string): string | null {
    switch (entityType) {
      case 'CONTAINER':
        return 'maas.docker.containers';
      case 'PROCESS':
        return 'maas.processes';
      case 'SERVICE':
        return 'maas.services';
      default:
        return null;
    }
  }

  private async ensureWatchMasterItems(
    zabbixHostId: string,
    entityType: string,
    serverIp?: string,
  ): Promise<void> {
    switch (entityType) {
      case 'CONTAINER':
        await this.ensureDockerItems(zabbixHostId);
        break;
      case 'PROCESS':
        await this.ensureProcGetItem(zabbixHostId);
        break;
      case 'SERVICE':
        await this.ensureServiceItems(zabbixHostId, serverIp);
        break;
    }
  }

  /**
   * Watch items are dependent on existing MAAS discovery items (no extra agent
   * UserParameters required on already-installed hosts).
   */
  async ensureWatchItems(
    zabbixHostId: string,
    itemKeys: string[],
    entityType: string,
    entityName: string,
    entityMeta?: Record<string, unknown>,
    serverIp?: string,
  ): Promise<void> {
    if (this.useMock() || !itemKeys.length) return;

    const masterKey = this.masterItemKeyForWatch(entityType);
    const script = this.watchPreprocessingScript(
      entityType,
      entityName,
      entityMeta,
    );
    if (!masterKey || !script) return;

    await this.ensureWatchMasterItems(zabbixHostId, entityType, serverIp);

    const masterItems = await this.rpc<Array<{ itemid: string }>>('item.get', {
      hostids: [zabbixHostId],
      filter: { key_: [masterKey] },
      output: ['itemid'],
      limit: 1,
    });
    const masterItemId = masterItems[0]?.itemid;
    if (!masterItemId) {
      this.logger.warn(
        `ensureWatchItems: master item ${masterKey} missing on host ${zabbixHostId}`,
      );
      return;
    }

    for (const key of itemKeys) {
      if (!key.startsWith('maas.watch.')) continue;

      const existing = await this.rpc<
        Array<{
          itemid: string;
          type: string;
          state: string;
          error: string;
          value_type: string;
        }>
      >('item.get', {
        hostids: [zabbixHostId],
        filter: { key_: [key] },
        output: ['itemid', 'type', 'state', 'error', 'value_type'],
        limit: 1,
      });

      const broken =
        existing[0] &&
        (existing[0].type === '0' ||
          existing[0].state === '1' ||
          existing[0].value_type === '3' ||
          /unsupported|not suitable/i.test(existing[0].error || ''));

      if (broken) {
        try {
          await this.rpc('item.delete', [existing[0].itemid]);
          this.logger.log(
            `Replaced broken watch item ${key} on host ${zabbixHostId}`,
          );
        } catch (error) {
          this.logger.warn(
            `Could not delete broken watch item ${key}: ${(error as Error).message}`,
          );
        }
      } else if (existing.length) {
        continue;
      }

      try {
        await this.rpc('item.create', {
          hostid: zabbixHostId,
          name: `MAAS watch: ${key}`,
          key_: key,
          type: 18,
          value_type: 4,
          delay: '0',
          history: '7d',
          trends: '0',
          master_itemid: masterItemId,
          preprocessing: [
            {
              type: 21,
              params: script,
              error_handler: 0,
              error_handler_params: '',
            },
          ],
        });
        this.logger.log(
          `Created dependent watch item ${key} on host ${zabbixHostId}`,
        );
      } catch (error) {
        this.logger.warn(
          `ensureWatchItems ${key}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async findWatchTrigger(params: {
    zabbixHostId: string;
    serverId: string;
    entityType: string;
    entityName: string;
    kind: 'down' | 'removed';
  }): Promise<string | null> {
    if (this.useMock()) return null;

    const triggers = await this.rpc<Array<{ triggerid: string }>>(
      'trigger.get',
      {
        hostids: [params.zabbixHostId],
        tags: [
          { tag: 'source', value: 'user-watch' },
          { tag: 'entity-name', value: params.entityName },
          { tag: 'server-id', value: params.serverId },
          { tag: 'alert-kind', value: params.kind },
        ],
        output: ['triggerid'],
      },
    );
    return triggers[0]?.triggerid ?? null;
  }

  async ensureEntityWatchTriggers(params: {
    zabbixHostId: string;
    serverId: string;
    entityType: string;
    entityName: string;
    entityMeta?: Record<string, unknown>;
    downExpression: string;
    removedExpression: string;
    downDescription: string;
    removedDescription: string;
    itemKeys: string[];
    serverIp?: string;
  }): Promise<{ downTriggerId: string; removedTriggerId: string }> {
    if (this.useMock()) {
      const suffix = `${params.entityType}-${params.entityName}`.replace(
        /\W+/g,
        '-',
      );
      return {
        downTriggerId: `mock-down-${suffix}`,
        removedTriggerId: `mock-removed-${suffix}`,
      };
    }

    await this.ensureWatchItems(
      params.zabbixHostId,
      params.itemKeys,
      params.entityType,
      params.entityName,
      params.entityMeta,
      params.serverIp,
    );

    const hostName = await this.getHostTechnicalName(params.zabbixHostId);
    const downExpr = params.downExpression.replace(/__ZBX_HOST__/g, hostName);
    const removedExpr = params.removedExpression.replace(
      /__ZBX_HOST__/g,
      hostName,
    );

    let downTriggerId = await this.findWatchTrigger({
      ...params,
      kind: 'down',
    });
    let removedTriggerId = await this.findWatchTrigger({
      ...params,
      kind: 'removed',
    });

    if (!downTriggerId) {
      const created = await this.rpc<{ triggerids: string[] }>(
        'trigger.create',
        {
          description: params.downDescription,
          expression: downExpr,
          priority: 4,
          status: 0,
          tags: this.watchTriggerTags({ ...params, kind: 'down' }),
        },
      );
      downTriggerId = created.triggerids[0];
    } else {
      await this.rpc('trigger.update', {
        triggerid: downTriggerId,
        description: params.downDescription,
        expression: downExpr,
        status: 0,
      });
    }

    if (!removedTriggerId) {
      const created = await this.rpc<{ triggerids: string[] }>(
        'trigger.create',
        {
          description: params.removedDescription,
          expression: removedExpr,
          priority: 3,
          status: 0,
          tags: this.watchTriggerTags({ ...params, kind: 'removed' }),
        },
      );
      removedTriggerId = created.triggerids[0];
    } else {
      await this.rpc('trigger.update', {
        triggerid: removedTriggerId,
        description: params.removedDescription,
        expression: removedExpr,
        status: 0,
      });
    }

    return { downTriggerId, removedTriggerId };
  }

  async setWatchTriggersEnabled(
    triggerIds: string[],
    enabled: boolean,
  ): Promise<void> {
    if (this.useMock() || !triggerIds.length) return;

    for (const triggerid of triggerIds) {
      try {
        await this.rpc('trigger.update', {
          triggerid,
          status: enabled ? 0 : 1,
        });
      } catch (error) {
        this.logger.warn(
          `setWatchTriggersEnabled ${triggerid}: ${(error as Error).message}`,
        );
      }
    }
  }

  async getTriggerProblemMap(
    triggerIds: string[],
  ): Promise<Map<string, 'OK' | 'PROBLEM'>> {
    const map = new Map<string, 'OK' | 'PROBLEM'>();
    if (!triggerIds.length) return map;

    if (this.useMock()) {
      for (const id of triggerIds) {
        map.set(id, 'OK');
      }
      return map;
    }

    const triggers = await this.rpc<Array<{ triggerid: string; value: string }>>(
      'trigger.get',
      {
        triggerids: triggerIds,
        output: ['triggerid', 'value'],
        selectLastEvent: 'eventid',
      },
    );
    for (const trigger of triggers) {
      map.set(trigger.triggerid, trigger.value === '1' ? 'PROBLEM' : 'OK');
    }
    return map;
  }

  async getLatestProblemEvent(triggerId: string): Promise<{
    eventId: string;
    name: string;
    severity: string;
    clock: string;
  } | null> {
    if (this.useMock()) return null;

    const events = await this.rpc<
      Array<{ eventid: string; name: string; severity: string; clock: string }>
    >('event.get', {
      objectids: [triggerId],
      source: 0,
      value: 1,
      output: ['eventid', 'name', 'severity', 'clock'],
      sortfield: 'clock',
      sortorder: 'DESC',
      limit: 1,
    });
    const event = events[0];
    if (!event) return null;
    return {
      eventId: event.eventid,
      name: event.name,
      severity: event.severity,
      clock: event.clock,
    };
  }

  /**
   * Single Zabbix action for all user-watch triggers (tag source=user-watch).
   * Sends problems to the MAAS incidents webhook.
   */
  async ensureUserWatchAction(): Promise<void> {
    if (this.useMock()) return;

    try {
      await this.ensureUserWatchActionInternal();
    } catch (error) {
      this.logger.warn(
        `ensureUserWatchAction failed (watch triggers still work): ${(error as Error).message}`,
      );
    }
  }

  private maasWebhookUrl(): string {
    const base =
      this.config.get<string>('app.publicApiUrl') ||
      'http://backend:4000/api/v1';
    return `${base.replace(/\/$/, '')}/incidents/webhook`;
  }

  private maasWebhookScript(): string {
    const url = this.maasWebhookUrl();
    const secret =
      this.config.get<string>('app.webhookSecret') || 'zabbix-webhook-secret';
    return [
      'try {',
      '  var params = JSON.parse(value);',
      '  var req = new HttpRequest();',
      '  req.AddHeader("Content-Type: application/json");',
      `  req.AddHeader("X-Webhook-Secret: ${secret}");`,
      '  var nsev = Number(params.event_nseverity || params.trigger_severity || 2);',
      '  var severity = "WARNING";',
      '  if (nsev >= 4) severity = "CRITICAL";',
      '  else if (nsev <= 1) severity = "INFO";',
      '  var body = JSON.stringify({',
      '    hostname: params.host || params.hostname || params.host_name,',
      '    severity: severity,',
      '    title: params.alert_subject || params.subject || params.trigger_name,',
      '    description: params.alert_message || params.message || "",',
      '    zabbixEventId: String(params.event_id || params.eventid || ""),',
      '    triggeredAt: params.event_date || params.date || ""',
      '  });',
      `  var resp = req.Post("${url}", body);`,
      '  if (req.GetStatus() !== 200 && req.GetStatus() !== 201) {',
      '    throw "HTTP " + req.GetStatus() + ": " + resp;',
      '  }',
      '  return "OK";',
      '} catch (error) {',
      '  throw "MAAS webhook failed: " + error;',
      '}',
    ].join('\n');
  }

  /** Ensure webhook media type is enabled and posts to the MAAS incidents API. */
  private async ensureMaasWebhookMediatype(): Promise<string | null> {
    if (this.useMock()) return null;

    const name = 'MAAS Webhook';
    const existing = await this.rpc<
      Array<{ mediatypeid: string; status: string }>
    >('mediatype.get', {
      output: ['mediatypeid', 'status'],
      filter: { name: [name] },
    });

    const payload = {
      name,
      type: 4,
      status: 0,
      parameters: [
        { name: 'URL', value: this.maasWebhookUrl() },
        { name: 'HTTPProxy', value: '' },
      ],
      script: this.maasWebhookScript(),
    };

    if (existing.length) {
      await this.rpc('mediatype.update', {
        mediatypeid: existing[0].mediatypeid,
        ...payload,
      });
      this.logger.log(`Updated Zabbix media type: ${name}`);
      return existing[0].mediatypeid;
    }

    const created = await this.rpc<{ mediatypeids: string[] }>(
      'mediatype.create',
      payload,
    );
    this.logger.log(`Created Zabbix media type: ${name}`);
    return created.mediatypeids[0];
  }

  /** Ensure the Zabbix API user can receive alerts via the MAAS webhook media type. */
  private async ensureNotifyUserMedia(mediatypeid: string): Promise<string | null> {
    const users = await this.rpc<
      Array<{ userid: string; medias?: Array<{ mediatypeid: string }> }>
    >('user.get', {
      output: ['userid'],
      filter: { username: [this.user] },
      selectMedias: ['mediatypeid'],
      limit: 1,
    });
    const user = users[0];
    if (!user) return null;

    const hasMedia = (user.medias ?? []).some(
      (media) => media.mediatypeid === mediatypeid,
    );
    if (!hasMedia) {
      await this.rpc('user.update', {
        userid: user.userid,
        medias: [
          {
            mediatypeid,
            sendto: ['maas@local'],
            active: 0,
            severity: 63,
            period: '1-7,00:00-24:00',
          },
        ],
      });
      this.logger.log(`Linked MAAS Webhook media to Zabbix user ${this.user}`);
    }

    return user.userid;
  }

  private async ensureUserWatchActionInternal(): Promise<void> {
    const mediatypeid = await this.ensureMaasWebhookMediatype();
    if (!mediatypeid) return;

    const notifyUserId = await this.ensureNotifyUserMedia(mediatypeid);
    if (!notifyUserId) return;

    const actionName = 'MAAS User Watch Alerts';
    const existing = await this.rpc<Array<{ actionid: string }>>('action.get', {
      output: ['actionid'],
      filter: { name: [actionName] },
    });

    const operations = [
      {
        operationtype: 0,
        opmessage: {
          default_msg: 0,
          subject: '[MAAS Watch] {TRIGGER.NAME}',
          message:
            'Host: {HOST.NAME}\nTrigger: {TRIGGER.NAME}\nStatus: {TRIGGER.STATUS}\nSeverity: {TRIGGER.SEVERITY}\nEvent: {EVENT.ID}',
          mediatypeid,
        },
        opmessage_usr: [{ userid: notifyUserId }],
      },
    ];

    const filter = {
      evaltype: 0,
      conditions: [
        {
          conditiontype: 26,
          operator: 0,
          value: 'source',
          value2: 'user-watch',
        },
      ],
    };

    if (existing.length > 0) {
      await this.rpc('action.update', {
        actionid: existing[0].actionid,
        status: 0,
        filter,
        operations,
      });
      return;
    }

    await this.rpc('action.create', {
      name: actionName,
      eventsource: 0,
      status: 0,
      esc_period: '1h',
      filter,
      operations,
    });

    this.logger.log(`Created Zabbix action: ${actionName}`);
  }
}
