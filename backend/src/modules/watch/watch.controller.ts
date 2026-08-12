import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles, TenantId } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import { CreateWatchDto } from './dto/create-watch.dto';
import { ListWatchQueryDto } from './dto/list-watch-query.dto';
import { WatchService } from './watch.service';

@Controller('watch')
export class WatchController {
  constructor(private readonly watchService: WatchService) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateWatchDto,
    @TenantId() tenantId: string | null,
  ) {
    return this.watchService.watch(user, dto, tenantId);
  }

  @Delete(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @TenantId() tenantId: string | null,
  ) {
    return this.watchService.unwatch(user, id, tenantId);
  }

  @Get('list')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  list(
    @CurrentUser() user: User,
    @Query() query: ListWatchQueryDto,
    @TenantId() tenantId: string | null,
  ) {
    return this.watchService.list(user, query, tenantId);
  }

  @Get('keys/:serverId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  keysForServer(
    @CurrentUser() user: User,
    @Param('serverId') serverId: string,
  ) {
    return this.watchService.watchedKeysForServer(user.id, serverId);
  }
}
