import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Public, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { SystemService } from './system.service';
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Get('health')
  getHealth() {
    return this.systemService.getHealth();
  }

  @Get('zabbix/status')
  @Roles(UserRole.SUPER_ADMIN)
  getZabbixStatus() {
    return this.systemService.getZabbixStatus();
  }

  @Post('zabbix/test')
  @Roles(UserRole.SUPER_ADMIN)
  testZabbix() {
    return this.systemService.testZabbixConnection();
  }

  @Get('settings')
  @Roles(UserRole.SUPER_ADMIN)
  getSettings() {
    return this.systemService.getSettings();
  }

  @Patch('settings')
  @Roles(UserRole.SUPER_ADMIN)
  updateSettings(@Body() settings: Record<string, string>) {
    return this.systemService.updateSettings(settings);
  }
}
