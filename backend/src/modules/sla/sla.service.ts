import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { Between, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ReportFormat, UserRole } from '../../common/enums';
import { Incident } from '../../entities/incident.entity';
import { Server } from '../../entities/server.entity';
import { SlaReport } from '../../entities/sla-report.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { ZabbixService } from '../zabbix/zabbix.service';
import {
  CreateSlaReportDto,
  SlaQueryDto,
  SlaReportsQueryDto,
} from './dto/sla.dto';
import { buildSlaPdf, type SlaReportIncident } from './sla-pdf.generator';

function periodBounds(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Server)
    private readonly serverRepo: Repository<Server>,
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(SlaReport)
    private readonly reportRepo: Repository<SlaReport>,
    private readonly zabbixService: ZabbixService,
    private readonly config: ConfigService,
  ) {}

  async getSlaSummary(query: SlaQueryDto, tenantFilterId: string | null) {
    const tenantId = tenantFilterId ?? query.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('tenantId is required');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const { from, to } = periodBounds(query.year, query.month);
    const servers = await this.serverRepo.find({
      where: { tenantId },
    });

    const incidents = await this.incidentRepo.find({
      where: {
        tenantId,
        openedAt: Between(from, to),
      },
    });

    const services = await Promise.all(
      servers.map(async (server) => {
        let uptimePercent = 100;
        let downtimeMinutes = 0;

        if (server.zabbixHostId) {
          const uptime = await this.zabbixService.getUptimeData(
            server.zabbixHostId,
            from,
            to,
          );
          uptimePercent = uptime.uptimePercent;
          downtimeMinutes = Math.round(uptime.totalDowntimeSeconds / 60);
        }

        const incidentCount = incidents.filter(
          (i) => i.serverId === server.id,
        ).length;

        return {
          serverId: server.id,
          hostname: server.hostname,
          uptimePercent,
          downtimeMinutes,
          incidentCount,
        };
      }),
    );

    const overallUptimePercent =
      services.length > 0
        ? Number(
            (
              services.reduce((sum, s) => sum + s.uptimePercent, 0) /
              services.length
            ).toFixed(2),
          )
        : 100;

    const totalDowntimeMinutes = services.reduce(
      (sum, s) => sum + s.downtimeMinutes,
      0,
    );

    const resolved = incidents.filter((i) => i.resolvedAt);
    const mttrMinutes =
      resolved.length > 0
        ? Math.round(
            resolved.reduce((sum, i) => {
              const ms =
                new Date(i.resolvedAt!).getTime() -
                new Date(i.openedAt).getTime();
              return sum + ms / 60000;
            }, 0) / resolved.length,
          )
        : 0;

    const period = `${query.year}-${String(query.month).padStart(2, '0')}`;

    return {
      tenantId,
      tenantName: tenant.name,
      period,
      overallUptimePercent,
      totalDowntimeMinutes,
      incidentCount: incidents.length,
      mttrMinutes,
      services,
    };
  }

  async createReport(dto: CreateSlaReportDto, user: User) {
    if (
      user.role === UserRole.TENANT_ADMIN &&
      dto.tenantId !== user.tenantId
    ) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }

    const summary = await this.getSlaSummary(
      { tenantId: dto.tenantId, year: dto.year, month: dto.month },
      user.role === UserRole.TENANT_ADMIN ? user.tenantId : null,
    );
    const incidentRows = await this.getReportIncidents(
      dto.tenantId,
      dto.year,
      dto.month,
    );

    const reportsDir =
      this.config.get<string>('app.reportsDir') || 'reports';
    await mkdir(reportsDir, { recursive: true });

    const generatedAt = new Date();
    const ext = dto.format === ReportFormat.PDF ? 'pdf' : 'csv';
    const filename = `sla-${dto.tenantId}-${dto.year}-${String(dto.month).padStart(2, '0')}-${uuidv4()}.${ext}`;
    const filePath = path.join(reportsDir, filename);

    if (dto.format === ReportFormat.CSV) {
      await writeFile(filePath, this.buildCsv(summary, incidentRows), 'utf8');
    } else {
      const pdf = await buildSlaPdf({
        ...summary,
        incidents: incidentRows,
        generatedAt,
        generatedBy: this.formatGeneratedBy(user),
      });
      await writeFile(filePath, pdf);
    }

    const report = await this.reportRepo.save(
      this.reportRepo.create({
        tenantId: dto.tenantId,
        year: dto.year,
        month: dto.month,
        format: dto.format,
        filePath,
        generatedAt,
        generatedByUserId: user.id,
      }),
    );

    return {
      reportId: report.id,
      downloadUrl: `/api/v1/sla/reports/${report.id}/download`,
      generatedAt: generatedAt.toISOString(),
    };
  }

  async listReports(query: SlaReportsQueryDto, tenantFilterId: string | null) {
    const qb = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.tenant', 'tenant')
      .orderBy('report.generatedAt', 'DESC');

    const effectiveTenantId = tenantFilterId ?? query.tenantId;
    if (effectiveTenantId) {
      qb.andWhere('report.tenantId = :tenantId', {
        tenantId: effectiveTenantId,
      });
    }
    if (query.year) {
      qb.andWhere('report.year = :year', { year: query.year });
    }

    const reports = await qb.getMany();

    return reports.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant?.name ?? '',
      year: r.year,
      month: r.month,
      format: r.format,
      generatedAt: r.generatedAt.toISOString(),
      downloadUrl: `/api/v1/sla/reports/${r.id}/download`,
    }));
  }

  async getReportForDownload(reportId: string, user: User) {
    const report = await this.reportRepo.findOne({
      where: { id: reportId },
      relations: { tenant: true },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const isTenantScoped =
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.CLIENT_VIEWER;

    if (isTenantScoped && report.tenantId !== user.tenantId) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }

    return report;
  }

  private formatGeneratedBy(user: User): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name ? `${name} (${user.email})` : user.email;
  }

  private async getReportIncidents(
    tenantId: string,
    year: number,
    month: number,
  ): Promise<SlaReportIncident[]> {
    const { from, to } = periodBounds(year, month);
    const incidents = await this.incidentRepo.find({
      where: {
        tenantId,
        openedAt: Between(from, to),
      },
      relations: { server: true },
      order: { openedAt: 'ASC' },
    });

    return incidents.map((incident) => ({
      title: incident.title,
      hostname: incident.server?.hostname ?? 'Unknown',
      severity: incident.severity,
      status: incident.status,
      openedAt: incident.openedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      durationMinutes: incident.resolvedAt
        ? Math.round(
            (incident.resolvedAt.getTime() - incident.openedAt.getTime()) /
              60000,
          )
        : null,
    }));
  }

  private buildCsv(
    summary: Awaited<ReturnType<SlaService['getSlaSummary']>>,
    incidents: SlaReportIncident[],
  ) {
    const lines = [
      'Tenant,Period,Overall Uptime %,Total Downtime (min),Incident Count,MTTR (min)',
      `"${summary.tenantName}","${summary.period}",${summary.overallUptimePercent},${summary.totalDowntimeMinutes},${summary.incidentCount},${summary.mttrMinutes}`,
      '',
      'Server,Hostname,Uptime %,Downtime (min),Incidents',
      ...summary.services.map(
        (s) =>
          `"${s.hostname}",${s.uptimePercent},${s.downtimeMinutes},${s.incidentCount}`,
      ),
      '',
      'Incidents — Opened,Server,Title,Severity,Status,Duration (min)',
      ...incidents.map(
        (i) =>
          `"${i.openedAt}","${i.hostname}","${i.title.replace(/"/g, '""')}",${i.severity},${i.status},${i.durationMinutes ?? ''}`,
      ),
    ];
    return lines.join('\n');
  }
}
