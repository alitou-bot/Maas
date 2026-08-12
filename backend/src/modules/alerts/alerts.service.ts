import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { Incident } from '../../entities/incident.entity';
import { Server } from '../../entities/server.entity';
import { ZabbixService } from '../zabbix/zabbix.service';
import { AlertsQueryDto } from './dto/alerts-query.dto';

export interface AlertResponse {
  zabbixEventId: string;
  tenantId: string;
  tenantName: string;
  serverId: string;
  hostname: string;
  severity: string;
  message: string;
  firedAt: string;
  resolvedAt: string | null;
  durationSeconds: number;
  linkedIncidentId: string | null;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Server)
    private readonly serverRepo: Repository<Server>,
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    private readonly zabbixService: ZabbixService,
  ) {}

  async findAll(query: AlertsQueryDto, tenantFilterId: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.serverRepo
      .createQueryBuilder('server')
      .leftJoinAndSelect('server.tenant', 'tenant')
      .where('server.zabbixHostId IS NOT NULL');

    const effectiveTenantId = tenantFilterId ?? query.tenantId;
    if (effectiveTenantId) {
      qb.andWhere('server.tenantId = :tenantId', {
        tenantId: effectiveTenantId,
      });
    }
    if (query.serverId) {
      qb.andWhere('server.id = :serverId', { serverId: query.serverId });
    }

    const servers = await qb.getMany();
    const hostIds = servers
      .map((s) => s.zabbixHostId)
      .filter((id): id is string => !!id);

    if (!hostIds.length) {
      return paginate<AlertResponse>([], 0, page, limit);
    }

    const zabbixAlerts = await this.zabbixService.getActiveAlerts(hostIds);
    const hostToServer = new Map(
      servers
        .filter((s) => s.zabbixHostId)
        .map((s) => [s.zabbixHostId!, s]),
    );

    const eventIds = zabbixAlerts.map((a) => a.zabbixEventId);
    const incidents =
      eventIds.length > 0
        ? await this.incidentRepo
            .createQueryBuilder('incident')
            .where('incident.zabbixEventId IN (:...eventIds)', { eventIds })
            .getMany()
        : [];
    const incidentByEvent = new Map(
      incidents.map((i) => [i.zabbixEventId!, i]),
    );

    const now = Date.now();
    let enriched: AlertResponse[] = zabbixAlerts
      .map((alert) => {
        const server = hostToServer.get(alert.zabbixHostId);
        if (!server) return null;

        const firedMs = new Date(alert.firedAt).getTime();
        const resolvedMs = alert.resolvedAt
          ? new Date(alert.resolvedAt).getTime()
          : null;
        const durationSeconds = Math.max(
          0,
          Math.floor(
            ((resolvedMs ?? now) - firedMs) / 1000,
          ),
        );

        const linked = incidentByEvent.get(alert.zabbixEventId);

        return {
          zabbixEventId: alert.zabbixEventId,
          tenantId: server.tenantId,
          tenantName: server.tenant?.name ?? '',
          serverId: server.id,
          hostname: server.hostname,
          severity: alert.severity,
          message: alert.message,
          firedAt: alert.firedAt,
          resolvedAt: alert.resolvedAt,
          durationSeconds,
          linkedIncidentId: linked?.id ?? null,
        };
      })
      .filter((a): a is AlertResponse => a !== null);

    if (query.severity) {
      enriched = enriched.filter((a) => a.severity === query.severity);
    }
    if (query.from) {
      const fromMs = new Date(query.from).getTime();
      enriched = enriched.filter(
        (a) => new Date(a.firedAt).getTime() >= fromMs,
      );
    }
    if (query.to) {
      const toMs = new Date(query.to).getTime();
      enriched = enriched.filter(
        (a) => new Date(a.firedAt).getTime() <= toMs,
      );
    }

    enriched.sort(
      (a, b) =>
        new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime(),
    );

    const total = enriched.length;
    const start = (page - 1) * limit;
    const data = enriched.slice(start, start + limit);

    return paginate(data, total, page, limit);
  }
}
