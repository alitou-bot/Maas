import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
