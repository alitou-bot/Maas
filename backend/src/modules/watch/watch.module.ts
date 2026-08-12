import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Server } from '../../entities/server.entity';
import { WatchedEntity } from '../../entities/watched-entity.entity';
import { IncidentsModule } from '../incidents/incidents.module';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { WatchController } from './watch.controller';
import { WatchService } from './watch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WatchedEntity, Server]),
    ZabbixModule,
    IncidentsModule,
  ],
  controllers: [WatchController],
  providers: [WatchService],
  exports: [WatchService],
})
export class WatchModule {}
