import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import {
  TestNotificationDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

type AuthedRequest = Request & {
  user: User;
  tenantFilterId?: string | null;
};

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('inbox')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getInbox(@CurrentUser() user: User, @Req() req: AuthedRequest) {
    return this.notificationsService.getInbox(user, req.tenantFilterId ?? null);
  }

  @Post('read-all')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  markAllRead(@CurrentUser() user: User, @Req() req: AuthedRequest) {
    return this.notificationsService.markAllRead(user, req.tenantFilterId ?? null);
  }

  @Post(':incidentId/read')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  markRead(
    @CurrentUser() user: User,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.notificationsService.markIncidentRead(
      user,
      incidentId,
      req.tenantFilterId ?? null,
    );
  }

  @Get('settings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  getSettings(@CurrentUser() user: User) {
    return this.notificationsService.getSettings(user);
  }

  @Patch('settings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(user, dto);
  }

  @Post('settings/test')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  testNotification(
    @CurrentUser() user: User,
    @Body() dto: TestNotificationDto,
  ) {
    return this.notificationsService.testNotification(user, dto);
  }
}
