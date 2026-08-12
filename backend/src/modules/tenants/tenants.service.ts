import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { IncidentStatus } from '../../common/enums';
import { Incident } from '../../entities/incident.entity';
import { Plan } from '../../entities/plan.entity';
import { Server } from '../../entities/server.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(Plan) private readonly plansRepo: Repository<Plan>,
    @InjectRepository(Server) private readonly serversRepo: Repository<Server>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
  ) {}

  private toPlanSummary(plan: Plan) {
    return {
      id: plan.id,
      name: plan.name,
      maxServers: plan.maxServers,
      retentionDays: plan.retentionDays,
      features: plan.features,
      priceMonthly: Number(plan.priceMonthly),
    };
  }

  private async getUsageCounts(tenantId: string) {
    const [serversUsed, userCount] = await Promise.all([
      this.serversRepo.count({ where: { tenantId } }),
      this.usersRepo.count({ where: { tenantId } }),
    ]);
    return { serversUsed, userCount };
  }

  private async toListItem(tenant: Tenant) {
    const { serversUsed, userCount } = await this.getUsageCounts(tenant.id);
    return {
      id: tenant.id,
      name: tenant.name,
      planId: tenant.planId,
      planName: tenant.plan?.name ?? null,
      serverLimit: tenant.serverLimit,
      serversUsed,
      userCount,
      status: tenant.status,
      createdAt: tenant.createdAt,
    };
  }

  private async toDetail(tenant: Tenant) {
    const { serversUsed, userCount } = await this.getUsageCounts(tenant.id);
    return {
      id: tenant.id,
      name: tenant.name,
      contactEmail: tenant.contactEmail,
      planId: tenant.planId,
      plan: tenant.plan ? this.toPlanSummary(tenant.plan) : null,
      serverLimit: tenant.serverLimit,
      serversUsed,
      userCount,
      status: tenant.status,
      notes: tenant.notes,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async findAll(query: ListTenantsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.tenantsRepo
      .createQueryBuilder('tenant')
      .leftJoinAndSelect('tenant.plan', 'plan');

    if (query.status) {
      qb.andWhere('tenant.status = :status', { status: query.status });
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('tenant.name ILIKE :term', { term })
            .orWhere('tenant.contactEmail ILIKE :term', { term });
        }),
      );
    }

    qb.orderBy('tenant.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [tenants, total] = await qb.getManyAndCount();
    const data = await Promise.all(tenants.map((t) => this.toListItem(t)));
    return paginate(data, total, page, limit);
  }

  async create(dto: CreateTenantDto) {
    const existing = await this.tenantsRepo.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Tenant name already exists');
    }

    const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const tenant = this.tenantsRepo.create({
      name: dto.name,
      contactEmail: dto.contactEmail.toLowerCase(),
      planId: dto.planId,
      serverLimit: dto.serverLimit,
      notes: dto.notes ?? null,
    });
    const saved = await this.tenantsRepo.save(tenant);
    const withPlan = await this.tenantsRepo.findOne({
      where: { id: saved.id },
      relations: { plan: true },
    });
    return this.toDetail(withPlan!);
  }

  async findOne(tenantId: string) {
    const tenant = await this.tenantsRepo.findOne({
      where: { id: tenantId },
      relations: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return this.toDetail(tenant);
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.tenantsRepo.findOne({
      where: { id: tenantId },
      relations: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.name && dto.name !== tenant.name) {
      const existing = await this.tenantsRepo.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Tenant name already exists');
      }
    }

    if (dto.planId && dto.planId !== tenant.planId) {
      const plan = await this.plansRepo.findOne({ where: { id: dto.planId } });
      if (!plan) {
        throw new NotFoundException('Plan not found');
      }
    }

    Object.assign(tenant, {
      ...dto,
      contactEmail: dto.contactEmail?.toLowerCase() ?? tenant.contactEmail,
    });
    const saved = await this.tenantsRepo.save(tenant);
    const withPlan = await this.tenantsRepo.findOne({
      where: { id: saved.id },
      relations: { plan: true },
    });
    return this.toDetail(withPlan!);
  }

  async updateStatus(tenantId: string, dto: UpdateTenantStatusDto) {
    const tenant = await this.tenantsRepo.findOne({
      where: { id: tenantId },
      relations: { plan: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    tenant.status = dto.status;
    await this.tenantsRepo.save(tenant);
    return this.toDetail(tenant);
  }

  async remove(tenantId: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const activeIncidents = await this.incidentsRepo.count({
      where: [
        {
          tenantId,
          status: IncidentStatus.OPEN,
        },
        {
          tenantId,
          status: IncidentStatus.IN_PROGRESS,
        },
      ],
    });

    if (activeIncidents > 0) {
      throw new ConflictException(
        'Cannot delete tenant with active incidents',
      );
    }

    await this.tenantsRepo.remove(tenant);
  }
}
