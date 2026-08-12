import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../../entities/system-setting.entity';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSetting]),
    ZabbixModule,
  ],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
