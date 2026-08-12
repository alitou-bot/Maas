import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { ServerGroup } from '../../entities/server-group.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

interface GroupRow {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
  tenantName: string | null;
  serverCount: string;
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(ServerGroup)
    private readonly groupsRepo: Repository<ServerGroup>,
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  private assertTenantAccess(
    tenantFilterId: string | null,
    resourceTenantId: string,
  ) {
    if (tenantFilterId && resourceTenantId !== tenantFilterId) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }
  }

  private toGroupDto(row: GroupRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      name: row.name,
      serverCount: Number(row.serverCount) || 0,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private buildGroupsQuery(tenantFilterId: string | null) {
    const qb = this.groupsRepo
      .createQueryBuilder('group')
      .leftJoin('group.tenant', 'tenant')
      .leftJoin('group.servers', 'server')
      .select('group.id', 'id')
      .addSelect('group.tenantId', 'tenantId')
      .addSelect('group.name', 'name')
      .addSelect('group.createdAt', 'createdAt')
      .addSelect('tenant.name', 'tenantName')
      .addSelect('COUNT(server.id)', 'serverCount')
      .groupBy('group.id')
      .addGroupBy('tenant.id')
      .orderBy('group.name', 'ASC');

    if (tenantFilterId) {
      qb.andWhere('group.tenantId = :tenantFilterId', { tenantFilterId });
    }

    return qb;
  }

  async findAll(tenantFilterId: string | null) {
    const rows = await this.buildGroupsQuery(tenantFilterId).getRawMany<GroupRow>();
    return rows.map((row) => this.toGroupDto(row));
  }

  async findOne(groupId: string, tenantFilterId: string | null) {
    const row = await this.buildGroupsQuery(tenantFilterId)
      .andWhere('group.id = :groupId', { groupId })
      .getRawOne<GroupRow>();

    if (!row) {
      throw new NotFoundException('Group not found');
    }
    this.assertTenantAccess(tenantFilterId, row.tenantId);
    return this.toGroupDto(row);
  }

  async create(dto: CreateGroupDto, currentUser: User) {
    let resolvedTenantId: string;

    if (currentUser.role === UserRole.TENANT_ADMIN) {
      if (!currentUser.tenantId) {
        throw new ForbiddenException(
          'Tenant admin must be associated with a tenant',
        );
      }
      resolvedTenantId = currentUser.tenantId;
    } else if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId is required');
      }
      resolvedTenantId = dto.tenantId;
    } else {
      throw new ForbiddenException('Insufficient permissions');
    }

    const tenant = await this.tenantsRepo.findOne({
      where: { id: resolvedTenantId },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const group = this.groupsRepo.create({
      tenantId: resolvedTenantId,
      name: dto.name,
    });
    const saved = await this.groupsRepo.save(group);
    return this.findOne(saved.id, null);
  }

  async update(groupId: string, dto: UpdateGroupDto) {
    const group = await this.groupsRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (dto.name !== undefined) {
      group.name = dto.name;
    }

    await this.groupsRepo.save(group);
    return this.findOne(groupId, null);
  }

  async remove(groupId: string) {
    const group = await this.groupsRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    await this.groupsRepo.remove(group);
  }
}
