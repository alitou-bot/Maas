import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { isIP } from 'node:net';
import { Roles } from '../common/decorators';
import { UserRole } from '../common/enums';
import { NetworkService } from './network.service';

class CreateDiscoveryRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  ipRange: string;

  @IsString()
  @IsNotEmpty()
  snmpCommunity: string;
}

@Controller('network')
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Get('devices')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getDevices() {
    return this.networkService.getDevices();
  }

  @Get('devices/:zabbixHostId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getDevice(@Param('zabbixHostId') zabbixHostId: string) {
    return this.networkService.getDevice(zabbixHostId);
  }

  @Get('discovery/rules')
  @Roles(UserRole.SUPER_ADMIN)
  getDiscoveryRules() {
    return this.networkService.getDiscoveryRules();
  }

  @Post('discovery/rules')
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN)
  createDiscoveryRule(@Body() dto: CreateDiscoveryRuleDto) {
    return this.networkService.createDiscoveryRule(dto);
  }

  @Post('discovery/rules/:ruleId/scan')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN)
  scanNetworkNow(@Param('ruleId') ruleId: string) {
    return this.networkService.scanNetworkNow(ruleId);
  }

  @Get('ping')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  ping(@Query('ip') ip?: string) {
    if (!ip || isIP(ip) === 0) {
      throw new BadRequestException('A valid ip query parameter is required');
    }
    return this.networkService.ping(ip);
  }
}
