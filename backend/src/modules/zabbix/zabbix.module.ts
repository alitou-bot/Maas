import { Module } from '@nestjs/common';
import { ZabbixService } from './zabbix.service';

@Module({
  providers: [ZabbixService],
  exports: [ZabbixService],
})
export class ZabbixModule {}
