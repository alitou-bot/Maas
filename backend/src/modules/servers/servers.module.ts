import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetworkModule } from '../../network/network.module';
import { Server } from '../../entities/server.entity';
import { ServerGroup } from '../../entities/server-group.entity';
import { Tenant } from '../../entities/tenant.entity';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server, ServerGroup, Tenant]),
    ZabbixModule,
    NetworkModule,
  ],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
