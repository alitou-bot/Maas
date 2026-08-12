import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemSetting } from '../../entities/system-setting.entity';
import { ZabbixService } from '../zabbix/zabbix.service';

@Injectable()
export class SystemService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly zabbixService: ZabbixService,
    private readonly config: ConfigService,
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
  ) {}

  async getHealth() {
    let database = 'connected';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'disconnected';
    }

    const zabbixResult = await this.zabbixService.testConnection();
    const zabbix = zabbixResult.connected ? 'connected' : 'disconnected';

    return {
      status: database === 'connected' && zabbix === 'connected' ? 'ok' : 'degraded',
      database,
      zabbix,
      timestamp: new Date().toISOString(),
    };
  }

  async getZabbixStatus() {
    const result = await this.zabbixService.testConnection();
    return {
      connected: result.connected,
      version: result.version,
      url: this.config.get<string>('app.zabbix.url') || '',
      mock: this.config.get<boolean>('app.zabbix.mock') !== false,
    };
  }

  async testZabbixConnection() {
    return this.zabbixService.testConnection();
  }

  async getSettings() {
    const rows = await this.settingsRepo.find();
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  async updateSettings(settings: Record<string, string>) {
    for (const [key, value] of Object.entries(settings)) {
      await this.settingsRepo.save({ key, value });
    }
    return this.getSettings();
  }
}
