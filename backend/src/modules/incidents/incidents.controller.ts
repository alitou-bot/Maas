import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import { CreateIncidentNoteDto } from './dto/create-note.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { IncidentWebhookDto } from './dto/webhook.dto';
import { IncidentsService } from './incidents.service';

type AuthedRequest = Request & {
  user: User;
  tenantFilterId?: string | null;
};

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Public()
  @Post('webhook')
  webhook(
    @Headers('x-webhook-secret') secret: string,
    @Body() dto: IncidentWebhookDto,
  ) {
    this.incidentsService.validateWebhookSecret(secret);
    return this.incidentsService.handleWebhook(dto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findAll(@Query() query: ListIncidentsQueryDto, @Req() req: AuthedRequest) {
    return this.incidentsService.findAll(query, req.tenantFilterId ?? null);
  }

  @Get(':incidentId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findOne(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.incidentsService.findOne(
      incidentId,
      req.tenantFilterId ?? null,
    );
  }

  @Patch(':incidentId/acknowledge')
  @Roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)
  acknowledge(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.acknowledge(incidentId, user);
  }

  @Patch(':incidentId/resolve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)
  resolve(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveIncidentDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.resolve(incidentId, dto, user);
  }

  @Patch(':incidentId/reopen')
  @Roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)
  reopen(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.incidentsService.reopen(incidentId);
  }

  @Post(':incidentId/notes')
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR)
  addNote(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateIncidentNoteDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.addNote(incidentId, dto, user);
  }

  @Get(':incidentId/notes')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  listNotes(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.incidentsService.listNotes(
      incidentId,
      req.tenantFilterId ?? null,
    );
  }
}
