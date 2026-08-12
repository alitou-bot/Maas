import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { IncidentSeverity, IncidentStatus } from '../../common/enums';
import { Incident } from '../../entities/incident.entity';
import { IncidentNote } from '../../entities/incident-note.entity';
import { Server } from '../../entities/server.entity';
import { User } from '../../entities/user.entity';
import { CreateIncidentNoteDto } from './dto/create-note.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { IncidentWebhookDto } from './dto/webhook.dto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
    @InjectRepository(IncidentNote)
    private readonly notesRepo: Repository<IncidentNote>,
    @InjectRepository(Server) private readonly serversRepo: Repository<Server>,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
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

  private assignedToName(user: User | null | undefined) {
    if (!user) return null;
    return `${user.firstName} ${user.lastName}`.trim();
  }

  private toNoteDto(note: IncidentNote) {
    return {
      id: note.id,
      incidentId: note.incidentId,
      authorId: note.authorId,
      authorName: note.author
        ? `${note.author.firstName} ${note.author.lastName}`.trim()
        : null,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    };
  }

  private toIncidentDto(incident: Incident, includeNotes = false) {
    const base = {
      id: incident.id,
      tenantId: incident.tenantId,
      tenantName: incident.tenant?.name ?? null,
      serverId: incident.serverId,
      hostname: incident.server?.hostname ?? null,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      assignedToUserId: incident.assignedToUserId,
      assignedToName: this.assignedToName(incident.assignedTo),
      openedAt: incident.openedAt.toISOString(),
      acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      zabbixEventId: incident.zabbixEventId,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };

    if (includeNotes) {
      return {
        ...base,
        notes: (incident.notes ?? []).map((n) => this.toNoteDto(n)),
      };
    }

    return base;
  }

  async findAll(query: ListIncidentsQueryDto, tenantFilterId: string | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.incidentsRepo
      .createQueryBuilder('incident')
      .leftJoinAndSelect('incident.tenant', 'tenant')
      .leftJoinAndSelect('incident.server', 'server')
      .leftJoinAndSelect('incident.assignedTo', 'assignedTo');

    if (tenantFilterId) {
      qb.andWhere('incident.tenantId = :tenantFilterId', { tenantFilterId });
    } else if (query.tenantId) {
      qb.andWhere('incident.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.serverId) {
      qb.andWhere('incident.serverId = :serverId', { serverId: query.serverId });
    }

    if (query.severity) {
      qb.andWhere('incident.severity = :severity', { severity: query.severity });
    }

    if (query.status) {
      qb.andWhere('incident.status = :status', { status: query.status });
    }

    if (query.assignedTo) {
      qb.andWhere('incident.assignedToUserId = :assignedTo', {
        assignedTo: query.assignedTo,
      });
    }

    if (query.from) {
      qb.andWhere('incident.openedAt >= :from', { from: new Date(query.from) });
    }

    if (query.to) {
      qb.andWhere('incident.openedAt <= :to', { to: new Date(query.to) });
    }

    qb.orderBy('incident.openedAt', 'DESC');

    const total = await qb.getCount();
    const incidents = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(
      incidents.map((i) => this.toIncidentDto(i)),
      total,
      page,
      limit,
    );
  }

  private async getIncidentOrFail(
    incidentId: string,
    tenantFilterId: string | null,
    withNotes = false,
  ) {
    const incident = await this.incidentsRepo.findOne({
      where: { id: incidentId },
      relations: withNotes
        ? {
            tenant: true,
            server: true,
            assignedTo: true,
            notes: { author: true },
          }
        : { tenant: true, server: true, assignedTo: true },
    });
    if (!incident) {
      throw new NotFoundException('Incident not found');
    }
    this.assertTenantAccess(tenantFilterId, incident.tenantId);
    return incident;
  }

  async findOne(incidentId: string, tenantFilterId: string | null) {
    const incident = await this.getIncidentOrFail(
      incidentId,
      tenantFilterId,
      true,
    );
    return this.toIncidentDto(incident, true);
  }

  async acknowledge(incidentId: string, user: User) {
    const incident = await this.getIncidentOrFail(incidentId, null);
    incident.status = IncidentStatus.IN_PROGRESS;
    incident.acknowledgedAt = new Date();
    incident.assignedToUserId = user.id;
    await this.incidentsRepo.save(incident);
    this.realtime.invalidate(['incidents', 'notifications'], incident.tenantId);
    return this.findOne(incidentId, null);
  }

  async resolve(
    incidentId: string,
    dto: ResolveIncidentDto,
    user: User,
  ) {
    const incident = await this.getIncidentOrFail(incidentId, null);
    incident.status = IncidentStatus.RESOLVED;
    incident.resolvedAt = new Date();
    await this.incidentsRepo.save(incident);

    if (dto.resolutionNote?.trim()) {
      await this.notesRepo.save(
        this.notesRepo.create({
          incidentId: incident.id,
          authorId: user.id,
          content: dto.resolutionNote.trim(),
        }),
      );
    }

    this.realtime.invalidate(['incidents', 'notifications'], incident.tenantId);
    return this.findOne(incidentId, null);
  }

  async reopen(incidentId: string) {
    const incident = await this.getIncidentOrFail(incidentId, null);
    incident.status = IncidentStatus.OPEN;
    incident.resolvedAt = null;
    await this.incidentsRepo.save(incident);
    this.realtime.invalidate(['incidents', 'notifications'], incident.tenantId);
    return this.findOne(incidentId, null);
  }

  async addNote(incidentId: string, dto: CreateIncidentNoteDto, user: User) {
    await this.getIncidentOrFail(incidentId, null);
    const note = await this.notesRepo.save(
      this.notesRepo.create({
        incidentId,
        authorId: user.id,
        content: dto.content,
      }),
    );
    const full = await this.notesRepo.findOne({
      where: { id: note.id },
      relations: { author: true },
    });
    return this.toNoteDto(full!);
  }

  async listNotes(incidentId: string, tenantFilterId: string | null) {
    await this.getIncidentOrFail(incidentId, tenantFilterId);
    const notes = await this.notesRepo.find({
      where: { incidentId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
    return notes.map((n) => this.toNoteDto(n));
  }

  validateWebhookSecret(secret: string | undefined) {
    const expected = this.config.get<string>('app.webhookSecret');
    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  async handleWebhook(dto: IncidentWebhookDto) {
    const server = await this.serversRepo.findOne({
      where: { hostname: dto.hostname },
    });
    if (!server) {
      throw new BadRequestException('Hostname not found');
    }

    const incident = this.incidentsRepo.create({
      tenantId: server.tenantId,
      serverId: server.id,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      status: IncidentStatus.OPEN,
      openedAt: dto.triggeredAt ? new Date(dto.triggeredAt) : new Date(),
      zabbixEventId: dto.zabbixEventId ?? null,
      assignedToUserId: null,
      acknowledgedAt: null,
      resolvedAt: null,
    });

    const saved = await this.incidentsRepo.save(incident);
    this.realtime.invalidate(['incidents', 'notifications'], server.tenantId);
    return { incidentId: saved.id };
  }
}
