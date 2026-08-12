import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { UserRole, UserStatus } from '../common/enums';
import { User } from '../entities/user.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async ensureServerInstallColumns() {
    // Production runs with synchronize:false — keep install-token columns
    // in sync without a full migration runner.
    await this.dataSource.query(`
      ALTER TABLE servers ALTER COLUMN "ipAddress" DROP NOT NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "pskIdentity" character varying NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "pskKey" character varying NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "installToken" character varying NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "tokenExpiresAt" timestamptz NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "tokenUsed" boolean NOT NULL DEFAULT false
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "installStatus" character varying NOT NULL DEFAULT 'PENDING'
    `);
    await this.dataSource.query(`
      ALTER TABLE servers ADD COLUMN IF NOT EXISTS "discoveryRuleId" character varying NULL
    `);
  }

  private async ensureWatchedEntitiesTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS watched_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "serverId" uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        "entityType" character varying NOT NULL,
        "entityName" character varying NOT NULL,
        "entityMeta" jsonb NULL,
        "zabbixHostId" character varying NOT NULL,
        "zabbixItemKeyDown" character varying NULL,
        "zabbixItemKeyRemoved" character varying NULL,
        "zabbixTriggerIdDown" character varying NULL,
        "zabbixTriggerIdRemoved" character varying NULL,
        "lastEventIdDown" character varying NULL,
        "lastEventIdRemoved" character varying NULL,
        status character varying NOT NULL DEFAULT 'ACTIVE',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS watched_entities_user_entity_uq
      ON watched_entities ("userId", "serverId", "entityType", "entityName")
    `);
    await this.dataSource.query(`
      ALTER TABLE watched_entities ADD COLUMN IF NOT EXISTS "lastEventIdDown" character varying NULL
    `);
    await this.dataSource.query(`
      ALTER TABLE watched_entities ADD COLUMN IF NOT EXISTS "lastEventIdRemoved" character varying NULL
    `);
  }

  private async ensureUserNotificationReadsTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS user_notification_reads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "incidentId" uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        "readAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_notification_reads_user_incident_uq UNIQUE ("userId", "incidentId")
      )
    `);
  }

  async onModuleInit() {
    try {
      await this.ensureServerInstallColumns();
      await this.ensureWatchedEntitiesTable();
      await this.ensureUserNotificationReadsTable();
    } catch (error) {
      this.logger.warn(
        `Could not ensure server install columns: ${(error as Error).message}`,
      );
    }

    if (this.config.get<string>('SEED_ON_BOOT') === 'false') return;
    const count = await this.users.count();
    if (count > 0) {
      this.logger.log('Database already has users — skipping seed');
      return;
    }
    this.logger.log('Seeding SUPER_ADMIN…');
    const password =
      this.config.get<string>('SEED_ADMIN_PASSWORD') || 'password123';
    const email =
      this.config.get<string>('SEED_ADMIN_EMAIL') || 'admin@ztc.ma';
    const hash = await bcrypt.hash(password, 10);
    await this.users.save(
      this.users.create({
        firstName: 'Super',
        lastName: 'Admin',
        email: email.toLowerCase(),
        passwordHash: hash,
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        status: UserStatus.ACTIVE,
      }),
    );
    this.logger.log(`Seed complete — ${email} / (SEED_ADMIN_PASSWORD)`);
  }
}
