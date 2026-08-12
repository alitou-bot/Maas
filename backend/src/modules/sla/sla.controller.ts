import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { CurrentUser, Roles, TenantId } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import {
  CreateSlaReportDto,
  SlaQueryDto,
  SlaReportsQueryDto,
} from './dto/sla.dto';
import { SlaService } from './sla.service';

@Controller('sla')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getSummary(
    @Query() query: SlaQueryDto,
    @TenantId() tenantId: string | null,
  ) {
    return this.slaService.getSlaSummary(query, tenantId);
  }

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
  )
  createReport(
    @Body() dto: CreateSlaReportDto,
    @CurrentUser() user: User,
  ) {
    return this.slaService.createReport(dto, user);
  }

  @Get('reports')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  listReports(
    @Query() query: SlaReportsQueryDto,
    @TenantId() tenantId: string | null,
  ) {
    return this.slaService.listReports(query, tenantId);
  }

  @Get('reports/:reportId/download')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  async downloadReport(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const report = await this.slaService.getReportForDownload(reportId, user);
    const ext = report.format === 'PDF' ? 'pdf' : 'csv';
    const tenantSlug = (report.tenant?.name ?? 'tenant')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const filename = `sla-${tenantSlug}-${report.year}-${String(report.month).padStart(2, '0')}.${ext}`;
    const contentType =
      report.format === 'PDF' ? 'application/pdf' : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    createReadStream(report.filePath).pipe(res);
  }
}
