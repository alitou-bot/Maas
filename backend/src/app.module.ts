import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import {
  AuditLog,
  Incident,
  IncidentNote,
  NotificationSettings,
  PasswordResetToken,
  Plan,
  Server,
  ServerGroup,
  SlaReport,
  SystemSetting,
  Tenant,
  User,
  WatchedEntity,
  UserNotificationRead,
} from './entities';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PlansModule } from './modules/plans/plans.module';
import { ServersModule } from './modules/servers/servers.module';
import { GroupsModule } from './modules/groups/groups.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { SlaModule } from './modules/sla/sla.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SystemModule } from './modules/system/system.module';
import { AuditModule } from './modules/audit/audit.module';
import { ZabbixModule } from './modules/zabbix/zabbix.module';
import { DatabaseModule } from './database/database.module';
import { NetworkModule } from './network/network.module';
import { WatchModule } from './modules/watch/watch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('app.database.host'),
        port: config.get<number>('app.database.port'),
        username: config.get<string>('app.database.username'),
        password: config.get<string>('app.database.password'),
        database: config.get<string>('app.database.database'),
        entities: [
          User,
          Tenant,
          Plan,
          Server,
          ServerGroup,
          Incident,
          IncidentNote,
          SlaReport,
          NotificationSettings,
          AuditLog,
          PasswordResetToken,
          SystemSetting,
          WatchedEntity,
          UserNotificationRead,
        ],
        synchronize: config.get<string>('app.nodeEnv') !== 'production',
        logging: config.get<string>('app.nodeEnv') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([AuditLog]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    PlansModule,
    ServersModule,
    GroupsModule,
    IncidentsModule,
    AlertsModule,
    SlaModule,
    NotificationsModule,
    SystemModule,
    AuditModule,
    ZabbixModule,
    NetworkModule,
    WatchModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
