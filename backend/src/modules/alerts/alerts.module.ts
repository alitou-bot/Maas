import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from '../../entities/incident.entity';
import { Server } from '../../entities/server.entity';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server, Incident]),
    ZabbixModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
