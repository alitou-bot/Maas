import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from '../../entities/incident.entity';
import { Server } from '../../entities/server.entity';
import { SlaReport } from '../../entities/sla-report.entity';
import { Tenant } from '../../entities/tenant.entity';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { SlaController } from './sla.controller';
import { SlaService } from './sla.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Server, Incident, SlaReport]),
    ZabbixModule,
  ],
  controllers: [SlaController],
  providers: [SlaService],
})
export class SlaModule {}
