import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WatchStatus, WatchedEntityType, IncidentSeverity } from '../../common/enums';
import { Server } from '../../entities/server.entity';
import { WatchedEntity } from '../../entities/watched-entity.entity';
import { User } from '../../entities/user.entity';
import { IncidentsService } from '../incidents/incidents.service';
import { ZabbixService } from '../zabbix/zabbix.service';
import { CreateWatchDto } from './dto/create-watch.dto';
import { ListWatchQueryDto } from './dto/list-watch-query.dto';

export interface WatchTriggerState {
  down: 'OK' | 'PROBLEM' | 'UNKNOWN';
  removed: 'OK' | 'PROBLEM' | 'UNKNOWN';
}

@Injectable()
export class WatchService {
  private readonly logger = new Logger(WatchService.name);

  constructor(
    @InjectRepository(WatchedEntity)
    private readonly watchesRepo: Repository<WatchedEntity>,
    @InjectRepository(Server)
    private readonly serversRepo: Repository<Server>,
    private readonly zabbix: ZabbixService,
    private readonly incidents: IncidentsService,
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

  private async loadServer(serverId: string, tenantFilterId: string | null) {
    const server = await this.serversRepo.findOne({
      where: { id: serverId },
      relations: ['tenant'],
    });
    if (!server) throw new NotFoundException('Server not found');
    this.assertTenantAccess(tenantFilterId, server.tenantId);
    if (!server.zabbixHostId) {
      throw new ForbiddenException(
        'Server is not linked to Zabbix yet — install the agent first',
      );
    }
    return server;
  }

  private resolveZabbixHostId(
    dto: CreateWatchDto,
    server: Server,
  ): { zabbixHostId: string; meta: Record<string, unknown> } {
    const meta = { ...(dto.entityMeta ?? {}) };
    if (dto.entityType === WatchedEntityType.NETWORK_DEVICE) {
      const deviceHostId = meta.zabbixHostId as string | undefined;
      if (!deviceHostId) {
        throw new ForbiddenException(
          'Network device watches require entityMeta.zabbixHostId',
        );
      }
      return { zabbixHostId: deviceHostId, meta };
    }
    return { zabbixHostId: server.zabbixHostId!, meta };
  }

  async watch(
    user: User,
    dto: CreateWatchDto,
    tenantFilterId: string | null,
  ) {
    const server = await this.loadServer(dto.serverId, tenantFilterId);
    const { zabbixHostId, meta } = this.resolveZabbixHostId(dto, server);

    const existing = await this.watchesRepo.findOne({
      where: {
        userId: user.id,
        serverId: dto.serverId,
        entityType: dto.entityType,
        entityName: dto.entityName,
      },
    });

    await this.zabbix.ensureUserWatchAction();

    const spec = this.buildWatchSpec(dto, zabbixHostId, meta);
    const triggers = await this.zabbix.ensureEntityWatchTriggers({
      zabbixHostId,
      serverId: dto.serverId,
      entityType: dto.entityType,
      entityName: dto.entityName,
      entityMeta: meta,
      serverIp: server.ipAddress ?? undefined,
      downExpression: spec.downExpression,
      removedExpression: spec.removedExpression,
      downDescription: spec.downDescription,
      removedDescription: spec.removedDescription,
      itemKeys: spec.itemKeys,
    });

    if (existing?.status === WatchStatus.ACTIVE) {
      if (triggers.downTriggerId) {
        existing.zabbixTriggerIdDown = triggers.downTriggerId;
      }
      if (triggers.removedTriggerId) {
        existing.zabbixTriggerIdRemoved = triggers.removedTriggerId;
      }
      await this.watchesRepo.save(existing);
      await this.zabbix.setWatchTriggersEnabled(
        [triggers.downTriggerId, triggers.removedTriggerId],
        true,
      );
      await this.syncIncidentsForWatch(existing, server);
      const states = await this.fetchTriggerStates(existing);
      return this.toDto(existing, server, states);
    }

    let row = existing;
    if (!row) {
      row = this.watchesRepo.create({
        userId: user.id,
        serverId: dto.serverId,
        entityType: dto.entityType,
        entityName: dto.entityName,
        entityMeta: Object.keys(meta).length ? meta : null,
        zabbixHostId,
        zabbixItemKeyDown: spec.itemKeys[0] ?? null,
        zabbixItemKeyRemoved: spec.itemKeys[0] ?? null,
        zabbixTriggerIdDown: triggers.downTriggerId,
        zabbixTriggerIdRemoved: triggers.removedTriggerId,
        status: WatchStatus.ACTIVE,
      });
    } else {
      row.entityMeta = Object.keys(meta).length ? meta : null;
      row.zabbixHostId = zabbixHostId;
      row.zabbixItemKeyDown = spec.itemKeys[0] ?? null;
      row.zabbixItemKeyRemoved = spec.itemKeys[0] ?? null;
      row.zabbixTriggerIdDown = triggers.downTriggerId;
      row.zabbixTriggerIdRemoved = triggers.removedTriggerId;
      row.status = WatchStatus.ACTIVE;
    }

    await this.watchesRepo.save(row);
    await this.zabbix.setWatchTriggersEnabled(
      [triggers.downTriggerId, triggers.removedTriggerId],
      true,
    );

    await this.syncIncidentsForWatch(row, server);

    const states = await this.fetchTriggerStates(row);
    return this.toDto(row, server, states);
  }

  private mapZabbixSeverity(severity: string): IncidentSeverity {
    const level = Number(severity);
    if (level >= 4) return IncidentSeverity.CRITICAL;
    if (level >= 2) return IncidentSeverity.WARNING;
    return IncidentSeverity.INFO;
  }

  /** Create MAAS incidents when watched Zabbix triggers enter PROBLEM. */
  private async syncIncidentsForWatch(
    watch: WatchedEntity,
    server: Server,
  ): Promise<void> {
    const pairs: Array<{
      kind: 'down' | 'removed';
      triggerId: string | null;
      lastEventField: 'lastEventIdDown' | 'lastEventIdRemoved';
    }> = [
      {
        kind: 'down',
        triggerId: watch.zabbixTriggerIdDown,
        lastEventField: 'lastEventIdDown',
      },
      {
        kind: 'removed',
        triggerId: watch.zabbixTriggerIdRemoved,
        lastEventField: 'lastEventIdRemoved',
      },
    ];

    const triggerIds = pairs
      .map((pair) => pair.triggerId)
      .filter(Boolean) as string[];
    if (!triggerIds.length) return;

    const problemMap = await this.zabbix.getTriggerProblemMap(triggerIds);
    let dirty = false;

    for (const pair of pairs) {
      if (!pair.triggerId) continue;
      if (problemMap.get(pair.triggerId) !== 'PROBLEM') continue;

      const event = await this.zabbix.getLatestProblemEvent(pair.triggerId);
      if (!event) continue;
      if (watch[pair.lastEventField] === event.eventId) continue;

      try {
        await this.incidents.handleWebhook({
          hostname: server.hostname,
          severity: this.mapZabbixSeverity(event.severity),
          title: event.name,
          description: `${event.name} (${pair.kind} alert on ${watch.entityType.toLowerCase()} "${watch.entityName}")`,
          zabbixEventId: event.eventId,
          triggeredAt: new Date(Number(event.clock) * 1000).toISOString(),
        });
        watch[pair.lastEventField] = event.eventId;
        dirty = true;
        this.logger.log(
          `Created incident for watch ${watch.entityName} (${pair.kind}) event ${event.eventId}`,
        );
      } catch (error) {
        this.logger.warn(
          `syncIncidentsForWatch ${watch.id} ${pair.kind}: ${(error as Error).message}`,
        );
      }
    }

    if (dirty) {
      await this.watchesRepo.save(watch);
    }
  }

  private async syncIncidentsForWatches(watches: WatchedEntity[]): Promise<void> {
    for (const watch of watches) {
      if (!watch.server) continue;
      await this.syncIncidentsForWatch(watch, watch.server);
    }
  }

  async unwatch(
    user: User,
    watchId: string,
    tenantFilterId: string | null,
  ) {
    const row = await this.watchesRepo.findOne({
      where: { id: watchId },
      relations: ['server'],
    });
    if (!row || row.userId !== user.id) {
      throw new NotFoundException('Watch not found');
    }
    this.assertTenantAccess(tenantFilterId, row.server.tenantId);

    const triggerIds = [
      row.zabbixTriggerIdDown,
      row.zabbixTriggerIdRemoved,
    ].filter(Boolean) as string[];
    if (triggerIds.length) {
      await this.zabbix.setWatchTriggersEnabled(triggerIds, false);
    }

    row.status = WatchStatus.DISABLED;
    await this.watchesRepo.save(row);
    return { id: row.id, status: row.status };
  }

  async list(
    user: User,
    query: ListWatchQueryDto,
    tenantFilterId: string | null,
  ) {
    const qb = this.watchesRepo
      .createQueryBuilder('w')
      .innerJoinAndSelect('w.server', 'server')
      .where('w.userId = :userId', { userId: user.id })
      .andWhere('w.status = :status', { status: WatchStatus.ACTIVE });

    if (query.serverId) {
      qb.andWhere('w.serverId = :serverId', { serverId: query.serverId });
    }
    if (query.entityType) {
      qb.andWhere('w.entityType = :entityType', {
        entityType: query.entityType,
      });
    }
    if (tenantFilterId) {
      qb.andWhere('server.tenantId = :tenantId', { tenantId: tenantFilterId });
    }

    qb.orderBy('w.createdAt', 'DESC');
    const rows = await qb.getMany();

    await this.syncIncidentsForWatches(rows);

    const triggerIds = rows.flatMap((row) =>
      [row.zabbixTriggerIdDown, row.zabbixTriggerIdRemoved].filter(
        Boolean,
      ) as string[],
    );
    const triggerMap = await this.zabbix.getTriggerProblemMap(triggerIds);

    return {
      watches: rows.map((row) =>
        this.toDto(row, row.server, {
          down: this.mapTriggerValue(
            row.zabbixTriggerIdDown,
            triggerMap,
          ),
          removed: this.mapTriggerValue(
            row.zabbixTriggerIdRemoved,
            triggerMap,
          ),
        }),
      ),
      total: rows.length,
    };
  }

  /** IDs of active watches for a server tab (star icon state). */
  async watchedKeysForServer(userId: string, serverId: string) {
    const rows = await this.watchesRepo.find({
      where: { userId, serverId, status: WatchStatus.ACTIVE },
      relations: ['server'],
    });
    await this.syncIncidentsForWatches(rows);
    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityName: row.entityName,
      entityMeta: row.entityMeta,
    }));
  }

  private mapTriggerValue(
    triggerId: string | null,
    map: Map<string, 'OK' | 'PROBLEM'>,
  ): WatchTriggerState['down'] {
    if (!triggerId) return 'UNKNOWN';
    return map.get(triggerId) ?? 'UNKNOWN';
  }

  private async fetchTriggerStates(
    row: WatchedEntity,
  ): Promise<WatchTriggerState> {
    const ids = [row.zabbixTriggerIdDown, row.zabbixTriggerIdRemoved].filter(
      Boolean,
    ) as string[];
    const map = await this.zabbix.getTriggerProblemMap(ids);
    return {
      down: this.mapTriggerValue(row.zabbixTriggerIdDown, map),
      removed: this.mapTriggerValue(row.zabbixTriggerIdRemoved, map),
    };
  }

  private buildWatchSpec(
    dto: CreateWatchDto,
    _zabbixHostId: string,
    meta: Record<string, unknown>,
  ) {
    const host = '__ZBX_HOST__';
    const name = dto.entityName;
    switch (dto.entityType) {
      case WatchedEntityType.CONTAINER: {
        const key = `maas.watch.container.state[${name}]`;
        return {
          itemKeys: [key],
          downDescription: `MAAS watch: container "${name}" is not running`,
          removedDescription: `MAAS watch: container "${name}" was removed`,
          downExpression: `last(/${host}/${key})<>"running" and last(/${host}/${key})<>"missing"`,
          removedExpression: `last(/${host}/${key})="missing"`,
        };
      }
      case WatchedEntityType.SERVICE: {
        const port = String(meta.port ?? name);
        const key = `maas.watch.service.port[${port}]`;
        return {
          itemKeys: [key],
          downDescription: `MAAS watch: service port ${port} is down`,
          removedDescription: `MAAS watch: service port ${port} discovery unavailable`,
          downExpression: `last(/${host}/${key})="0"`,
          removedExpression: `nodata(/${host}/maas.services,5m)=1`,
        };
      }
      case WatchedEntityType.PROCESS: {
        const key = `maas.watch.process.count[${name}]`;
        return {
          itemKeys: [key],
          downDescription: `MAAS watch: process "${name}" is not running`,
          removedDescription: `MAAS watch: process "${name}" discovery unavailable`,
          downExpression: `last(/${host}/${key})="0"`,
          removedExpression: `nodata(/${host}/maas.processes,5m)=1`,
        };
      }
      case WatchedEntityType.NETWORK_DEVICE: {
        return {
          itemKeys: ['icmpping'],
          downDescription: `MAAS watch: network device "${name}" is unreachable`,
          removedDescription: `MAAS watch: network device "${name}" stopped responding`,
          downExpression: `last(/${host}/icmpping)=0`,
          removedExpression: `nodata(/${host}/icmpping,5m)=1`,
        };
      }
      case WatchedEntityType.NETWORK_INTERFACE: {
        const ifName = String(meta.ifName ?? name);
        const key = `net.if.status[${ifName}]`;
        return {
          itemKeys: [key],
          downDescription: `MAAS watch: interface "${ifName}" is down`,
          removedDescription: `MAAS watch: interface "${ifName}" no longer discovered`,
          downExpression: `last(/${host}/${key})<>1`,
          removedExpression: `nodata(/${host}/${key},5m)=1`,
        };
      }
      default:
        throw new ForbiddenException(
          `Watch type ${dto.entityType} is not supported yet`,
        );
    }
  }

  private toDto(
    row: WatchedEntity,
    server: Server,
    states: WatchTriggerState,
  ) {
    return {
      id: row.id,
      entityType: row.entityType,
      entityName: row.entityName,
      entityMeta: row.entityMeta,
      serverId: row.serverId,
      hostname: server.hostname,
      zabbixHostId: row.zabbixHostId,
      status: row.status,
      triggerStatus: states,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
