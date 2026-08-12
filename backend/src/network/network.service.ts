import { Injectable, NotFoundException } from '@nestjs/common';
import { ZabbixService } from '../modules/zabbix/zabbix.service';

type ZabbixHost = {
  hostid: string;
  host: string;
  name: string;
  available?: string;
  snmp_available?: string;
  lastaccess?: string;
  description?: string;
  interfaces?: Array<{
    ip?: string;
    type?: string;
    port?: string;
    available?: string;
    interfaceid?: string;
  }>;
  groups?: Array<{ groupid: string; name: string }>;
  tags?: Array<{ tag: string; value: string }>;
  items?: Array<{ key_?: string; lastvalue?: string; lastclock?: string }>;
};

@Injectable()
export class NetworkService {
  constructor(private readonly zabbix: ZabbixService) {}

  private statusOf(
    host: ZabbixHost,
    pingOverride?: 'UP' | 'DOWN' | 'UNKNOWN',
  ): 'UP' | 'DOWN' | 'UNKNOWN' {
    if (pingOverride === 'UP' || pingOverride === 'DOWN') {
      return pingOverride;
    }

    // ICMP / agent ping items (preferred for discovered network devices)
    const pingItem =
      host.items?.find((item) => item.key_ === 'icmpping') ??
      host.items?.find((item) => item.key_ === 'agent.ping');
    if (pingItem && Number(pingItem.lastclock ?? 0) > 0) {
      return pingItem.lastvalue === '1' ? 'UP' : 'DOWN';
    }

    // Interface availability: 1 = available, 2 = unavailable, 0 = unknown
    const interfaces = host.interfaces ?? [];
    const snmpIface = interfaces.find((entry) => entry.type === '2');
    const agentIface = interfaces.find((entry) => entry.type === '1');
    for (const iface of [snmpIface, agentIface, ...interfaces]) {
      if (!iface?.available) continue;
      if (iface.available === '1') return 'UP';
      if (iface.available === '2') return 'DOWN';
    }

    if (host.snmp_available === '1' || host.available === '1') return 'UP';
    if (host.snmp_available === '2' || host.available === '2') return 'DOWN';

    // Recent metric collection implies the device is responding
    const latestItem = Math.max(
      0,
      ...(host.items ?? []).map((item) => Number(item.lastclock ?? 0)),
    );
    if (latestItem > 0 && Date.now() / 1000 - latestItem < 600) {
      return 'UP';
    }

    return pingOverride ?? 'UNKNOWN';
  }

  private typeOf(host: ZabbixHost): string {
    const text = [
      host.name,
      host.host,
      host.description,
      ...(host.tags ?? []).flatMap((tag) => [tag.tag, tag.value]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/\brouter\b|gateway/.test(text)) return 'router';
    if (/\bswitch\b/.test(text)) return 'switch';
    if (/access point|\bap\b|wireless/.test(text)) return 'ap';
    if (/printer/.test(text)) return 'printer';
    return 'unknown';
  }

  private lastSeenOf(
    host: ZabbixHost,
    pingLastClock = 0,
  ): string | null {
    const itemClock = Math.max(
      0,
      pingLastClock,
      ...(host.items ?? []).map((item) => Number(item.lastclock ?? 0)),
    );
    const clock = Math.max(Number(host.lastaccess ?? 0), itemClock);
    return clock > 0 ? new Date(clock * 1000).toISOString() : null;
  }

  private mapHost(
    host: ZabbixHost,
    fallbackGroup?: string,
    ping?: { status: 'UP' | 'DOWN' | 'UNKNOWN'; lastClock: number },
  ) {
    const group =
      host.groups?.find((entry) =>
        ['Network devices', 'Discovered devices'].includes(entry.name),
      )?.name ??
      fallbackGroup ??
      'Unknown';
    return {
      zabbixHostId: host.hostid,
      name: host.name || host.host,
      ip: host.interfaces?.find((entry) => entry.ip)?.ip ?? '',
      type: this.typeOf(host),
      status: this.statusOf(host, ping?.status),
      lastSeen: this.lastSeenOf(host, ping?.lastClock ?? 0),
      description: host.description || null,
      groupName: group,
    };
  }

  async getDevicesForServer(serverId: string) {
    const groupName = this.zabbix.serverNetworkGroupName(serverId);
    const hosts = (await this.zabbix.getHostsByGroup(groupName)) as ZabbixHost[];

    await Promise.all(
      hosts.map((host) =>
        this.zabbix.ensureIcmpPingItems(host.hostid).catch(() => undefined),
      ),
    );

    const data = await Promise.all(
      hosts.map(async (host) => {
        const [snmp, ping] = await Promise.all([
          this.zabbix.getSnmpData(host.hostid),
          this.zabbix.getIcmpPingStatus(host.hostid),
        ]);
        return this.mapHost(
          {
            ...host,
            description: snmp.description ?? host.description,
          },
          groupName,
          ping,
        );
      }),
    );
    data.sort((a, b) => a.name.localeCompare(b.name));
    return { data, total: data.length };
  }

  async getDeviceForServer(serverId: string, zabbixHostId: string) {
    const groupName = this.zabbix.serverNetworkGroupName(serverId);
    const hosts = (await this.zabbix.getHostsByGroup(groupName)) as ZabbixHost[];
    const host = hosts.find((entry) => entry.hostid === zabbixHostId);
    if (!host) throw new NotFoundException('Network device not found');

    await this.zabbix.ensureIcmpPingItems(zabbixHostId).catch(() => undefined);
    const [snmp, activeAlerts, ping] = await Promise.all([
      this.zabbix.getSnmpData(zabbixHostId),
      this.zabbix.getActiveAlerts([zabbixHostId]),
      this.zabbix.getIcmpPingStatus(zabbixHostId),
    ]);
    const summary = this.mapHost(host, groupName, ping);
    const now = Date.now();
    return {
      zabbixHostId,
      name: summary.name,
      ip: summary.ip,
      status: summary.status,
      description: snmp.description ?? summary.description,
      groupName: summary.groupName,
      lastSeen: summary.lastSeen,
      snmp,
      alerts: activeAlerts.map((alert) => {
        const firedAt = new Date(alert.firedAt).getTime();
        const resolvedAt = alert.resolvedAt
          ? new Date(alert.resolvedAt).getTime()
          : now;
        return {
          zabbixEventId: alert.zabbixEventId,
          severity: alert.severity,
          message: alert.message,
          firedAt: alert.firedAt,
          resolvedAt: alert.resolvedAt,
          durationSeconds: Math.max(
            0,
            Math.floor((resolvedAt - firedAt) / 1000),
          ),
        };
      }),
    };
  }

  async getDevices() {
    const groupNames = ['Network devices', 'Discovered devices'];
    const grouped = await Promise.all(
      groupNames.map(async (groupName) => ({
        groupName,
        hosts: (await this.zabbix.getHostsByGroup(groupName)) as ZabbixHost[],
      })),
    );
    const uniqueHosts = new Map<
      string,
      { host: ZabbixHost; groupName: string }
    >();
    for (const result of grouped) {
      for (const host of result.hosts) {
        uniqueHosts.set(host.hostid, { host, groupName: result.groupName });
      }
    }

    // Ensure every discovered device has ICMP ping items for live status
    await Promise.all(
      Array.from(uniqueHosts.keys()).map((hostId) =>
        this.zabbix.ensureIcmpPingItems(hostId).catch(() => undefined),
      ),
    );

    const data = await Promise.all(
      Array.from(uniqueHosts.values()).map(async ({ host, groupName }) => {
        const [snmp, ping] = await Promise.all([
          this.zabbix.getSnmpData(host.hostid),
          this.zabbix.getIcmpPingStatus(host.hostid),
        ]);
        return this.mapHost(
          {
            ...host,
            description: snmp.description ?? host.description,
          },
          groupName,
          ping,
        );
      }),
    );
    data.sort((a, b) => a.name.localeCompare(b.name));
    return { data, total: data.length };
  }

  async getDevice(zabbixHostId: string) {
    const hosts = (await this.zabbix.getDiscoveredHosts()) as ZabbixHost[];
    const host = hosts.find((entry) => entry.hostid === zabbixHostId);
    if (!host) throw new NotFoundException('Network device not found');

    const inNetworkGroup = host.groups?.some((entry) =>
      ['Network devices', 'Discovered devices'].includes(entry.name),
    );
    if (!inNetworkGroup) {
      throw new NotFoundException('Network device not found');
    }

    await this.zabbix.ensureIcmpPingItems(zabbixHostId).catch(() => undefined);
    const [snmp, activeAlerts, ping] = await Promise.all([
      this.zabbix.getSnmpData(zabbixHostId),
      this.zabbix.getActiveAlerts([zabbixHostId]),
      this.zabbix.getIcmpPingStatus(zabbixHostId),
    ]);
    const summary = this.mapHost(host, undefined, ping);
    const now = Date.now();
    return {
      zabbixHostId,
      name: summary.name,
      ip: summary.ip,
      status: summary.status,
      description: snmp.description ?? summary.description,
      groupName: summary.groupName,
      lastSeen: summary.lastSeen,
      snmp,
      alerts: activeAlerts.map((alert) => {
        const firedAt = new Date(alert.firedAt).getTime();
        const resolvedAt = alert.resolvedAt
          ? new Date(alert.resolvedAt).getTime()
          : now;
        return {
          zabbixEventId: alert.zabbixEventId,
          severity: alert.severity,
          message: alert.message,
          firedAt: alert.firedAt,
          resolvedAt: alert.resolvedAt,
          durationSeconds: Math.max(
            0,
            Math.floor((resolvedAt - firedAt) / 1000),
          ),
        };
      }),
    };
  }

  async getDiscoveryRules() {
    const rules = await this.zabbix.getDiscoveryRules();
    return rules.map((rule) => {
      const nextCheck = Number(rule.nextcheck ?? 0);
      return {
        id: rule.druleid,
        name: rule.name,
        ipRange: rule.iprange,
        interval: rule.delay,
        status: rule.status === '0' ? 'active' : 'disabled',
        nextScan:
          nextCheck > 0 ? new Date(nextCheck * 1000).toISOString() : null,
      };
    });
  }

  async createDiscoveryRule(params: {
    name: string;
    ipRange: string;
    snmpCommunity: string;
  }) {
    const ruleId = await this.zabbix.createDiscoveryRule(params);
    return { ruleId, message: 'Discovery rule created' };
  }

  async scanNetworkNow(ruleId: string) {
    await this.zabbix.scanNetworkNow(ruleId);
    return { message: 'Scan triggered' };
  }

  async ping(ip: string) {
    const result = await this.zabbix.pingHost(ip);
    return { ip, ...result };
  }
}
