import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { User } from '../../entities/user.entity';
import { CreateServerDto } from './dto/create-server.dto';
import { ListServersQueryDto } from './dto/list-servers.dto';
import { ServerMetricsQueryDto } from './dto/server-metrics-query.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersService } from './servers.service';

type AuthedRequest = Request & {
  user: User;
  tenantFilterId?: string | null;
};

@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findAll(@Query() query: ListServersQueryDto, @Req() req: AuthedRequest) {
    return this.serversService.findAll(query, req.tenantFilterId ?? null);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  create(@Body() dto: CreateServerDto, @Req() req: AuthedRequest) {
    return this.serversService.create(dto, req.user, req);
  }

  // Public — token is the authentication
  @Public()
  @Get('install/:token')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getInstallScript(@Param('token') token: string, @Req() req: Request) {
    return this.serversService.generateInstallScript(token, req);
  }

  @Public()
  @Post('install/:token/confirm')
  confirmInstall(
    @Param('token') token: string,
    @Body() body: { hostname: string; ip: string },
  ) {
    return this.serversService.confirmInstall(token, body);
  }

  @Get(':serverId/connection-status')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getConnectionStatus(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getConnectionStatus(serverId, {
      role: req.user.role,
      tenantId: req.user.tenantId,
    });
  }

  @Get(':serverId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  findOne(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.findOne(serverId, req.tenantFilterId ?? null);
  }

  @Get(':serverId/metrics')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getMetrics(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Query() query: ServerMetricsQueryDto,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getMetrics(
      serverId,
      query,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/processes')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getProcesses(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getProcesses(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/services')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getServices(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getServices(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/containers')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getContainers(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getContainers(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/network-devices')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getNetworkDevices(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getNetworkDevices(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/network-devices/:zabbixHostId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getNetworkDevice(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('zabbixHostId') zabbixHostId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getNetworkDevice(
      serverId,
      zabbixHostId,
      req.tenantFilterId ?? null,
    );
  }

  @Post(':serverId/network-devices/scan')
  @HttpCode(200)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
  )
  scanNetworkDevices(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.scanNetworkDevices(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/network')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getNetwork(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getNetworkRates(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Get(':serverId/system')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.NOC_OPERATOR,
    UserRole.TENANT_ADMIN,
    UserRole.CLIENT_VIEWER,
  )
  getSystem(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.getSystemInfo(
      serverId,
      req.tenantFilterId ?? null,
    );
  }

  @Patch(':serverId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  update(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Body() dto: UpdateServerDto,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.update(
      serverId,
      dto,
      req.tenantFilterId ?? null,
    );
  }

  @Delete(':serverId')
  @HttpCode(204)
  @Roles(UserRole.SUPER_ADMIN, UserRole.TENANT_ADMIN)
  remove(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.serversService.remove(serverId, req.tenantFilterId ?? null);
  }
}
