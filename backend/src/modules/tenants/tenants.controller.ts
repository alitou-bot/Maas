import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)
  @Get()
  findAll(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  @Get(':tenantId')
  findOne(@Param('tenantId') tenantId: string) {
    return this.tenantsService.findOne(tenantId);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':tenantId/status')
  updateStatus(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.updateStatus(tenantId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':tenantId')
  update(@Param('tenantId') tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(tenantId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':tenantId')
  @HttpCode(204)
  remove(@Param('tenantId') tenantId: string) {
    return this.tenantsService.remove(tenantId);
  }
}
