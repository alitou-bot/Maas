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
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @Get()
  findAll(@CurrentUser() actor: User, @Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(actor, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @Post()
  create(@CurrentUser() actor: User, @Body() dto: CreateUserDto) {
    return this.usersService.create(actor, dto);
  }

  @Get(':userId')
  findOne(@CurrentUser() actor: User, @Param('userId') userId: string) {
    return this.usersService.findOne(actor, userId);
  }

  @Patch(':userId')
  update(
    @CurrentUser() actor: User,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(actor, userId, dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @Delete(':userId')
  @HttpCode(204)
  remove(@CurrentUser() actor: User, @Param('userId') userId: string) {
    return this.usersService.remove(actor, userId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  @Post(':userId/reset-password')
  resetPassword(
    @CurrentUser() actor: User,
    @Param('userId') userId: string,
  ) {
    return this.usersService.resetPassword(actor, userId);
  }
}
