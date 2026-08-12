import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../entities/plan.entity';
import { Tenant } from '../../entities/tenant.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan) private readonly plansRepo: Repository<Plan>,
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  private toPlanDto(plan: Plan) {
    return {
      id: plan.id,
      name: plan.name,
      maxServers: plan.maxServers,
      retentionDays: plan.retentionDays,
      features: plan.features,
      priceMonthly: Number(plan.priceMonthly),
    };
  }

  async findAll() {
    const plans = await this.plansRepo.find({ order: { name: 'ASC' } });
    return plans.map((plan) => this.toPlanDto(plan));
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.plansRepo.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Plan name already exists');
    }

    const plan = this.plansRepo.create(dto);
    const saved = await this.plansRepo.save(plan);
    return this.toPlanDto(saved);
  }

  async update(planId: string, dto: UpdatePlanDto) {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (dto.name && dto.name !== plan.name) {
      const existing = await this.plansRepo.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Plan name already exists');
      }
    }

    Object.assign(plan, dto);
    const saved = await this.plansRepo.save(plan);
    return this.toPlanDto(saved);
  }

  async remove(planId: string) {
    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const tenantCount = await this.tenantsRepo.count({
      where: { planId },
    });
    if (tenantCount > 0) {
      throw new ConflictException('Plan is in use by one or more tenants');
    }

    await this.plansRepo.remove(plan);
  }
}
