import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';

type AuthedRequest = Request & {
  user: User;
  tenantFilterId?: string | null;
};

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findAll(@Req() req: AuthedRequest) {
    return this.groupsService.findAll(req.tenantFilterId ?? null);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  create(@Body() dto: CreateGroupDto, @Req() req: AuthedRequest) {
    return this.groupsService.create(dto, req.user);
  }

  @Patch(':groupId')
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(groupId, dto);
  }

  @Delete(':groupId')
  @HttpCode(204)
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groupsService.remove(groupId);
  }
}
