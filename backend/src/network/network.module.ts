import { Module } from '@nestjs/common';
import { ZabbixModule } from '../modules/zabbix/zabbix.module';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';

@Module({
  imports: [ZabbixModule],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [NetworkService],
})
export class NetworkModule {}
