import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, IsNull } from 'typeorm';
import {
  IncidentSeverity,
  IncidentStatus,
  NotificationChannel,
  UserRole,
} from '../../common/enums';
import { Incident } from '../../entities/incident.entity';
import { NotificationSettings } from '../../entities/notification-settings.entity';
import { UserNotificationRead } from '../../entities/user-notification-read.entity';
import { User } from '../../entities/user.entity';
import { RealtimeService } from '../realtime/realtime.service';
import {
  TestNotificationDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationSettings)
    private readonly settingsRepo: Repository<NotificationSettings>,
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
    @InjectRepository(UserNotificationRead)
    private readonly readsRepo: Repository<UserNotificationRead>,
    private readonly realtime: RealtimeService,
  ) {}

  private resolveTenantId(user: User): string | null {
    if (user.role === UserRole.SUPER_ADMIN) {
      return null;
    }
    if (user.role === UserRole.TENANT_ADMIN) {
      if (!user.tenantId) {
        throw new ForbiddenException('User has no tenant association');
      }
      return user.tenantId;
    }
    throw new ForbiddenException('Insufficient role privileges');
  }

  private toResponse(settings: NotificationSettings) {
    return {
      emailEnabled: settings.emailEnabled,
      emailRecipients: settings.emailRecipients,
      slackWebhookUrl: settings.slackWebhookUrl,
      discordWebhookUrl: settings.discordWebhookUrl,
      minSeverity: settings.minSeverity,
    };
  }

  private async getOrCreate(tenantId: string | null) {
    let settings = await this.settingsRepo.findOne({
      where: { tenantId: tenantId === null ? IsNull() : tenantId },
    });

    if (!settings) {
      settings = await this.settingsRepo.save(
        this.settingsRepo.create({
          tenantId,
          emailEnabled: true,
          emailRecipients: [],
          slackWebhookUrl: null,
          discordWebhookUrl: null,
          minSeverity: IncidentSeverity.WARNING,
        }),
      );
    }

    return settings;
  }

  async getSettings(user: User) {
    const tenantId = this.resolveTenantId(user);
    const settings = await this.getOrCreate(tenantId);
    return this.toResponse(settings);
  }

  async updateSettings(user: User, dto: UpdateNotificationSettingsDto) {
    const tenantId = this.resolveTenantId(user);
    const settings = await this.getOrCreate(tenantId);

    if (dto.emailEnabled !== undefined) {
      settings.emailEnabled = dto.emailEnabled;
    }
    if (dto.emailRecipients !== undefined) {
      settings.emailRecipients = dto.emailRecipients;
    }
    if (dto.slackWebhookUrl !== undefined) {
      settings.slackWebhookUrl = dto.slackWebhookUrl;
    }
    if (dto.discordWebhookUrl !== undefined) {
      settings.discordWebhookUrl = dto.discordWebhookUrl;
    }
    if (dto.minSeverity !== undefined) {
      settings.minSeverity = dto.minSeverity;
    }

    const saved = await this.settingsRepo.save(settings);
    return this.toResponse(saved);
  }

  async testNotification(user: User, dto: TestNotificationDto) {
    const tenantId = this.resolveTenantId(user);
    const settings = await this.getOrCreate(tenantId);

    switch (dto.channel) {
      case NotificationChannel.EMAIL:
        if (
          !settings.emailEnabled ||
          !settings.emailRecipients?.length
        ) {
          throw new BadRequestException('Email channel is not configured');
        }
        break;
      case NotificationChannel.SLACK:
        if (!settings.slackWebhookUrl) {
          throw new BadRequestException('Slack channel is not configured');
        }
        break;
      case NotificationChannel.DISCORD:
        if (!settings.discordWebhookUrl) {
          throw new BadRequestException('Discord channel is not configured');
        }
        break;
    }

    return { message: 'Test sent' };
  }

  async getInbox(user: User, tenantFilterId: string | null) {
    const qb = this.incidentsRepo
      .createQueryBuilder('incident')
      .where('incident.status IN (:...statuses)', {
        statuses: [IncidentStatus.OPEN, IncidentStatus.IN_PROGRESS],
      })
      .orderBy('incident.openedAt', 'DESC')
      .take(20);

    if (tenantFilterId) {
      qb.andWhere('incident.tenantId = :tenantFilterId', { tenantFilterId });
    }

    const incidents = await qb.getMany();
    const incidentIds = incidents.map((i) => i.id);

    const reads =
      incidentIds.length === 0
        ? []
        : await this.readsRepo.find({
            where: { userId: user.id, incidentId: In(incidentIds) },
            select: ['incidentId'],
          });
    const readSet = new Set(reads.map((r) => r.incidentId));

    const items = incidents.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      openedAt: i.openedAt.toISOString(),
      read: readSet.has(i.id),
    }));

    return {
      items,
      unreadCount: items.filter((i) => !i.read).length,
    };
  }

  async markAllRead(user: User, tenantFilterId: string | null) {
    const qb = this.incidentsRepo
      .createQueryBuilder('incident')
      .select('incident.id')
      .where('incident.status IN (:...statuses)', {
        statuses: [IncidentStatus.OPEN, IncidentStatus.IN_PROGRESS],
      });

    if (tenantFilterId) {
      qb.andWhere('incident.tenantId = :tenantFilterId', { tenantFilterId });
    }

    const rows = await qb.getMany();
    if (rows.length === 0) {
      return { marked: 0 };
    }

    const incidentIds = rows.map((r) => r.id);
    const existing = await this.readsRepo.find({
      where: { userId: user.id, incidentId: In(incidentIds) },
      select: ['incidentId'],
    });
    const existingSet = new Set(existing.map((r) => r.incidentId));

    const toInsert = incidentIds
      .filter((id) => !existingSet.has(id))
      .map((incidentId) =>
        this.readsRepo.create({ userId: user.id, incidentId }),
      );

    if (toInsert.length > 0) {
      await this.readsRepo.save(toInsert);
    }

    this.realtime.emitToUser(user.id, ['notifications']);
    return { marked: toInsert.length };
  }

  async markIncidentRead(
    user: User,
    incidentId: string,
    tenantFilterId: string | null,
  ) {
    const incident = await this.incidentsRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException('Incident not found');
    }
    if (tenantFilterId && incident.tenantId !== tenantFilterId) {
      throw new ForbiddenException("You do not have access to this tenant's data");
    }

    const existing = await this.readsRepo.findOne({
      where: { userId: user.id, incidentId },
    });
    if (!existing) {
      await this.readsRepo.save(
        this.readsRepo.create({ userId: user.id, incidentId }),
      );
    }

    this.realtime.emitToUser(user.id, ['notifications']);
    return { ok: true };
  }
}
