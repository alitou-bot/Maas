import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import type { Request } from 'express';
import { Not, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { ServerStatus, UserRole } from '../../common/enums';
import { resolvePublicEndpoints } from '../../common/utils/public-endpoints';
import { NetworkService } from '../../network/network.service';
import { Server } from '../../entities/server.entity';
import { ServerGroup } from '../../entities/server-group.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import {
  HostMetricSummary,
  ZabbixService,
} from '../zabbix/zabbix.service';
import { CreateServerDto } from './dto/create-server.dto';
import { ListServersQueryDto } from './dto/list-servers.dto';
import { ServerMetricsQueryDto } from './dto/server-metrics-query.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { buildInstallScript } from './install-scripts';
import { buildInstallCommand, getServerOsLabel } from './server-os';

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    @InjectRepository(Server) private readonly serversRepo: Repository<Server>,
    @InjectRepository(ServerGroup)
    private readonly groupsRepo: Repository<ServerGroup>,
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
    private readonly zabbix: ZabbixService,
    private readonly network: NetworkService,
    private readonly config: ConfigService,
  ) {}

  private assertTenantAccess(
    tenantFilterId: string | null,
    resourceTenantId: string,
  ) {
    if (tenantFilterId && resourceTenantId !== tenantFilterId) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }
  }

  private toServerDto(server: Server, live?: HostMetricSummary) {
    return {
      id: server.id,
      tenantId: server.tenantId,
      tenantName: server.tenant?.name ?? null,
      hostname: server.hostname,
      ipAddress: server.ipAddress,
      os: server.os,
      groupId: server.groupId,
      groupName: server.group?.name ?? null,
      status: live?.status ?? server.status,
      cpuPercent: live?.cpuPercent ?? server.cpuPercent,
      memPercent: live?.memPercent ?? server.memPercent,
      diskPercent: live?.diskPercent ?? server.diskPercent,
      uptime: server.uptime,
      lastCheck: live?.lastCheck ?? server.lastCheck?.toISOString() ?? null,
      zabbixHostId: server.zabbixHostId,
      notes: server.notes,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }

  async findAll(query: ListServersQueryDto, tenantFilterId: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serversRepo
      .createQueryBuilder('server')
      .leftJoinAndSelect('server.tenant', 'tenant')
      .leftJoinAndSelect('server.group', 'group');

    if (tenantFilterId) {
      qb.andWhere('server.tenantId = :tenantFilterId', { tenantFilterId });
    } else if (query.tenantId) {
      qb.andWhere('server.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.status) {
      qb.andWhere('server.status = :status', { status: query.status });
    }

    if (query.groupId) {
      qb.andWhere('server.groupId = :groupId', { groupId: query.groupId });
    }

    if (query.search) {
      qb.andWhere(
        '(server.hostname ILIKE :search OR server.ipAddress ILIKE :search OR server.os ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('server.hostname', 'ASC');

    const total = await qb.getCount();
    const servers = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const summaries = await this.zabbix.getHostSummaries(
      servers.flatMap((server) =>
        server.zabbixHostId ? [server.zabbixHostId] : [],
      ),
    );

    return paginate(
      servers.map((server) =>
        this.toServerDto(
          server,
          server.zabbixHostId
            ? summaries.get(server.zabbixHostId)
            : undefined,
        ),
      ),
      total,
      page,
      limit,
    );
  }

  async findOne(serverId: string, tenantFilterId: string | null) {
    const server = await this.serversRepo.findOne({
      where: { id: serverId },
      relations: { tenant: true, group: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    this.assertTenantAccess(tenantFilterId, server.tenantId);
    const summaries = await this.zabbix.getHostSummaries(
      server.zabbixHostId ? [server.zabbixHostId] : [],
    );
    return this.toServerDto(
      server,
      server.zabbixHostId
        ? summaries.get(server.zabbixHostId)
        : undefined,
    );
  }

  async create(
    dto: CreateServerDto,
    currentUser: User,
    req?: Request,
  ): Promise<{
    serverId: string;
    installToken: string;
    installCommand: string;
    os: string;
  }> {
    let resolvedTenantId: string;

    if (currentUser.role === UserRole.TENANT_ADMIN) {
      if (!currentUser.tenantId) {
        throw new ForbiddenException('No tenant associated');
      }
      resolvedTenantId = currentUser.tenantId;
    } else if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId is required');
      }
      resolvedTenantId = dto.tenantId;
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenant = await this.tenantsRepo.findOne({
      where: { id: resolvedTenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.groupId) {
      const group = await this.groupsRepo.findOne({
        where: { id: dto.groupId },
      });
      if (!group || group.tenantId !== resolvedTenantId) {
        throw new BadRequestException(
          'Group not found or does not belong to tenant',
        );
      }
    }

    let zabbixGroupId = await this.zabbix.ensureHostGroup(
      `Tenant: ${tenant.name}`,
      tenant.zabbixGroupId,
    );
    if (zabbixGroupId !== tenant.zabbixGroupId) {
      await this.tenantsRepo.update(resolvedTenantId, { zabbixGroupId });
    }

    const installToken = randomUUID();
    const pskIdentity = `maas-${resolvedTenantId.slice(0, 8)}-${installToken.slice(0, 8)}`;
    const pskKey = randomBytes(32).toString('hex');
    const placeholderHostname = `pending-${installToken.slice(0, 8)}`;

    let zabbixHostId: string;
    try {
      zabbixHostId = await this.zabbix.createHostWithPSK({
        hostname: placeholderHostname,
        groupId: zabbixGroupId,
        templateId: dto.templateId ?? '10001',
        pskIdentity,
        pskKey,
      });
    } catch (error) {
      throw new HttpException(
        {
          message: 'Zabbix registration failed',
          reason: (error as Error).message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);

    const server = this.serversRepo.create({
      tenantId: resolvedTenantId,
      hostname: placeholderHostname,
      ipAddress: null,
      os: getServerOsLabel(dto.os),
      groupId: dto.groupId ?? null,
      zabbixHostId,
      pskIdentity,
      pskKey,
      installToken,
      tokenExpiresAt,
      tokenUsed: false,
      installStatus: 'PENDING',
      notes: dto.notes ?? null,
      status: ServerStatus.UNKNOWN,
    });
    const saved = await this.serversRepo.save(server);

    const { backendPublicUrl } = resolvePublicEndpoints(req);
    const installCommand = buildInstallCommand(
      backendPublicUrl,
      installToken,
      dto.os,
    );

    return {
      serverId: saved.id,
      installToken,
      installCommand,
      os: saved.os,
    };
  }

  async generateInstallScript(
    token: string,
    req?: Request,
  ): Promise<string> {
    const server = await this.serversRepo.findOne({
      where: { installToken: token },
    });

    if (!server) {
      throw new NotFoundException('Invalid install token');
    }

    if (server.tokenUsed) {
      throw new ForbiddenException(
        'This install token has already been used',
      );
    }

    if (!server.tokenExpiresAt || server.tokenExpiresAt < new Date()) {
      throw new ForbiddenException(
        'This install token has expired. Generate a new one.',
      );
    }

    const { zabbixServerIp, backendPublicUrl: backendUrl } =
      resolvePublicEndpoints(req);

    return buildInstallScript({
      token,
      expiresIso: server.tokenExpiresAt.toISOString(),
      zabbixServerIp,
      backendUrl,
      pskIdentity: server.pskIdentity ?? '',
      pskKey: server.pskKey ?? '',
      os: server.os,
    });
  }

  async confirmInstall(
    token: string,
    body: { hostname: string; ip: string },
  ): Promise<{ message: string }> {
    const server = await this.serversRepo.findOne({
      where: { installToken: token },
    });

    if (!server) {
      throw new NotFoundException('Invalid token');
    }
    if (server.tokenUsed) {
      throw new ForbiddenException('Token already used');
    }
    if (!server.tokenExpiresAt || server.tokenExpiresAt < new Date()) {
      throw new ForbiddenException('Token expired');
    }
    if (!server.zabbixHostId) {
      throw new BadRequestException('Server has no Zabbix host');
    }

    await this.zabbix.updateHostname(
      server.zabbixHostId,
      body.hostname,
      body.ip,
    );

    await this.serversRepo.update(server.id, {
      hostname: body.hostname,
      ipAddress: body.ip,
      tokenUsed: true,
      installStatus: 'PENDING',
    });

    // Auto-trigger network discovery for this server's LAN (await so rule is saved)
    try {
      await this.autoCreateDiscoveryRule(
        server.id,
        body.ip,
        body.hostname,
      );
    } catch (err) {
      this.logger.warn(
        `Auto network discovery failed: ${(err as Error).message}`,
      );
    }

    return { message: 'Hostname registered — agent connecting' };
  }

  private async autoCreateDiscoveryRule(
    serverId: string,
    serverIp: string,
    serverHostname: string,
  ): Promise<void> {
    // ── Calculate network range from IP ────────────
    // e.g. 192.168.1.45 → 192.168.1.1-254
    // e.g. 10.0.2.15    → 10.0.2.1-254
    const parts = serverIp.split('.');
    if (parts.length !== 4) {
      this.logger.warn(`Invalid IP format: ${serverIp}`);
      return;
    }

    const networkRange = `${parts[0]}.${parts[1]}.${parts[2]}.1-254`;
    const ruleName = `MAAS Auto: ${serverHostname} (${networkRange})`;

    this.logger.log(
      `Auto network discovery: ${networkRange} for server ${serverId} (${serverHostname})`,
    );

    const disabled = await this.zabbix.disableOtherDiscoveryRules(networkRange);
    if (disabled > 0) {
      this.logger.log(`Disabled ${disabled} stale discovery rule(s)`);
    }

    const ruleId = await this.zabbix.ensureFastIcmpDiscoveryRule({
      name: ruleName,
      ipRange: networkRange,
    });

    this.logger.log(`Using discovery rule ${ruleId} for ${networkRange}`);

    await this.zabbix.createDiscoveryAction().catch((err) => {
      this.logger.warn(
        `Global discovery action setup failed: ${(err as Error).message}`,
      );
    });
    await this.zabbix
      .ensureServerNetworkDiscovery({ serverId, ruleId })
      .catch((err) => {
        this.logger.warn(
          `Per-server discovery action setup failed: ${(err as Error).message}`,
        );
      });

    await this.serversRepo.update(serverId, { discoveryRuleId: ruleId });
    await this.zabbix.scanNetworkNow(ruleId);

    const networkPrefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
    this.scheduleNetworkHostSync(serverId, networkPrefix);

    this.logger.log(
      `Immediate network scan triggered for ${networkRange}`,
    );
  }

  /** Re-sync discovered hosts into the server group while Zabbix scan runs. */
  private scheduleNetworkHostSync(serverId: string, networkPrefix: string) {
    const sync = () => {
      this.zabbix
        .syncDiscoveredHostsToServerGroup(serverId, networkPrefix)
        .catch((err) => {
          this.logger.debug(
            `Network host sync for ${serverId}: ${(err as Error).message}`,
          );
        });
    };
    sync();
    for (const delayMs of [30_000, 90_000, 180_000]) {
      setTimeout(sync, delayMs);
    }
  }

  private async maybeAutoDiscoverNetwork(server: Server): Promise<void> {
    if (server.discoveryRuleId || !server.ipAddress) return;
    if (server.ipAddress === '0.0.0.0') return;
    try {
      await this.autoCreateDiscoveryRule(
        server.id,
        server.ipAddress,
        server.hostname,
      );
    } catch (err) {
      this.logger.warn(
        `Auto network discovery on connect failed: ${(err as Error).message}`,
      );
    }
  }

  async getConnectionStatus(
    serverId: string,
    currentUser: { role: string; tenantId: string | null },
  ): Promise<{
    installStatus: string;
    connected: boolean;
    hostname: string | null;
    lastSeen: string | null;
  }> {
    const server = await this.serversRepo.findOne({
      where: { id: serverId },
    });

    if (!server) {
      throw new NotFoundException('Server not found');
    }

    if (
      currentUser.role === UserRole.TENANT_ADMIN ||
      currentUser.role === UserRole.CLIENT_VIEWER
    ) {
      if (server.tenantId !== currentUser.tenantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (!server.zabbixHostId) {
      return {
        installStatus: server.installStatus,
        connected: false,
        hostname: server.hostname,
        lastSeen: null,
      };
    }

    const zabbixStatus = await this.zabbix.checkAgentConnected(
      server.zabbixHostId,
    );

    // Also treat confirm-complete + non-placeholder hostname as connected
    // when Zabbix interface is still catching up.
    const hostnameReady =
      server.tokenUsed &&
      !!server.hostname &&
      !server.hostname.startsWith('pending-');
    const connected =
      zabbixStatus.connected ||
      server.installStatus === 'CONNECTED' ||
      (hostnameReady && server.status === ServerStatus.UP);

    if (connected && server.installStatus === 'PENDING') {
      await this.serversRepo.update(server.id, {
        installStatus: 'CONNECTED',
        status: ServerStatus.UP,
        hostname: zabbixStatus.hostname ?? server.hostname,
      });
    }

    if (connected) {
      const refreshed = await this.serversRepo.findOne({
        where: { id: serverId },
      });
      if (refreshed) {
        void this.maybeAutoDiscoverNetwork(refreshed);
      }
    }

    return {
      installStatus: connected ? 'CONNECTED' : server.installStatus,
      connected,
      hostname: zabbixStatus.hostname ?? server.hostname,
      lastSeen: zabbixStatus.lastSeen,
    };
  }

  async update(
    serverId: string,
    dto: UpdateServerDto,
    tenantFilterId: string | null,
  ) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    this.assertTenantAccess(tenantFilterId, server.tenantId);

    if (dto.hostname !== undefined && dto.hostname !== server.hostname) {
      const existing = await this.serversRepo.findOne({
        where: {
          hostname: dto.hostname,
          tenantId: server.tenantId,
        },
      });
      if (existing && existing.id !== server.id) {
        throw new ConflictException(
          'This hostname already exists for this tenant',
        );
      }
    }

    if (dto.groupId !== undefined && dto.groupId !== null) {
      const group = await this.groupsRepo.findOne({
        where: { id: dto.groupId },
      });
      if (!group || group.tenantId !== server.tenantId) {
        throw new BadRequestException(
          'Group not found or does not belong to tenant',
        );
      }
    }

    const hostnameChanged =
      dto.hostname !== undefined && dto.hostname !== server.hostname;
    const ipChanged =
      dto.ipAddress !== undefined && dto.ipAddress !== server.ipAddress;

    if ((hostnameChanged || ipChanged) && server.zabbixHostId) {
      try {
        await this.zabbix.updateHost({
          hostId: server.zabbixHostId,
          hostname: hostnameChanged ? dto.hostname : undefined,
          ip: ipChanged ? dto.ipAddress : undefined,
        });
      } catch (error) {
        throw new HttpException(
          {
            message: 'Zabbix update failed',
            reason: (error as Error).message,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    if (dto.hostname !== undefined) server.hostname = dto.hostname;
    if (dto.ipAddress !== undefined) server.ipAddress = dto.ipAddress;
    if (dto.os !== undefined) server.os = getServerOsLabel(dto.os);
    if (dto.groupId !== undefined) server.groupId = dto.groupId;
    if (dto.notes !== undefined) server.notes = dto.notes;

    await this.serversRepo.save(server);
    return this.findOne(serverId, tenantFilterId);
  }

  async remove(serverId: string, tenantFilterId: string | null) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    this.assertTenantAccess(tenantFilterId, server.tenantId);

    const discoveryRuleId = server.discoveryRuleId;

    if (server.zabbixHostId) {
      await this.zabbix.deleteHost(server.zabbixHostId);
    }

    await this.zabbix.cleanupServerNetwork(server.id, null);

    if (discoveryRuleId) {
      const others = await this.serversRepo.count({
        where: {
          discoveryRuleId,
          id: Not(server.id),
        },
      });
      if (others === 0) {
        try {
          await this.zabbix.rpcDeleteDiscoveryRule(discoveryRuleId);
        } catch (error) {
          this.logger.warn(
            `Failed to delete discovery rule ${discoveryRuleId}: ${(error as Error).message}`,
          );
        }
      }
    }

    await this.serversRepo.remove(server);
  }

  async getNetworkDevices(serverId: string, tenantFilterId: string | null) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    this.assertTenantAccess(tenantFilterId, server.tenantId);
    return this.network.getDevicesForServer(serverId);
  }

  async getNetworkDevice(
    serverId: string,
    zabbixHostId: string,
    tenantFilterId: string | null,
  ) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    this.assertTenantAccess(tenantFilterId, server.tenantId);
    return this.network.getDeviceForServer(serverId, zabbixHostId);
  }

  async scanNetworkDevices(serverId: string, tenantFilterId: string | null) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) throw new NotFoundException('Server not found');
    this.assertTenantAccess(tenantFilterId, server.tenantId);

    if (!server.discoveryRuleId) {
      if (!server.ipAddress) {
        throw new BadRequestException(
          'Server has no IP yet — run the install script first',
        );
      }
      await this.autoCreateDiscoveryRule(
        server.id,
        server.ipAddress,
        server.hostname,
      );
      const refreshed = await this.serversRepo.findOne({
        where: { id: serverId },
      });
      if (!refreshed?.discoveryRuleId) {
        throw new BadRequestException('Could not create network discovery rule');
      }
      return { message: 'Network scan started' };
    }

    await this.zabbix.scanNetworkNow(server.discoveryRuleId);
    return { message: 'Network scan started' };
  }

  async getMetrics(
    serverId: string,
    query: ServerMetricsQueryDto,
    tenantFilterId: string | null,
  ) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    this.assertTenantAccess(tenantFilterId, server.tenantId);

    if (!server.zabbixHostId) {
      throw new BadRequestException('Server has no Zabbix host configured');
    }

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to timestamps');
    }

    const dataPoints = await this.zabbix.getMetrics(
      server.zabbixHostId,
      query.metric,
      from,
      to,
    );

    return {
      metric: query.metric,
      serverId: server.id,
      hostname: server.hostname,
      from: from.toISOString(),
      to: to.toISOString(),
      dataPoints,
    };
  }

  private async requireServerWithZabbix(
    serverId: string,
    tenantFilterId: string | null,
  ) {
    const server = await this.serversRepo.findOne({ where: { id: serverId } });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    this.assertTenantAccess(tenantFilterId, server.tenantId);
    if (!server.zabbixHostId) {
      throw new BadRequestException('Server has no Zabbix host configured');
    }
    return server as Server & { zabbixHostId: string };
  }

  async getProcesses(serverId: string, tenantFilterId: string | null) {
    const server = await this.requireServerWithZabbix(
      serverId,
      tenantFilterId,
    );
    const [processes, total] = await Promise.all([
      this.zabbix.getProcesses(server.zabbixHostId),
      this.zabbix.getProcessTotal(server.zabbixHostId),
    ]);
    return {
      processes,
      total: total || processes.reduce((sum, p) => sum + p.instances, 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  async getServices(serverId: string, tenantFilterId: string | null) {
    const server = await this.requireServerWithZabbix(
      serverId,
      tenantFilterId,
    );
    const services = await this.zabbix.getListeningPorts(
      server.zabbixHostId,
      server.ipAddress ?? undefined,
    );
    return { services };
  }

  async getContainers(serverId: string, tenantFilterId: string | null) {
    const server = await this.requireServerWithZabbix(
      serverId,
      tenantFilterId,
    );
    return this.zabbix.getDockerContainers(server.zabbixHostId);
  }

  async getNetworkRates(serverId: string, tenantFilterId: string | null) {
    const server = await this.requireServerWithZabbix(
      serverId,
      tenantFilterId,
    );
    return this.zabbix.getNetworkRates(server.zabbixHostId);
  }

  async getSystemInfo(serverId: string, tenantFilterId: string | null) {
    const server = await this.requireServerWithZabbix(
      serverId,
      tenantFilterId,
    );
    return this.zabbix.getSystemInfo(server.zabbixHostId);
  }
}
