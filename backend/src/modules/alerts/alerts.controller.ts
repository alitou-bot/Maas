import { Controller, Get, Query } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AlertsService } from './alerts.service';
import { AlertsQueryDto } from './dto/alerts-query.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findAll(@Query() query: AlertsQueryDto, @TenantId() tenantId: string | null) {
    return this.alertsService.findAll(query, tenantId);
  }
}
