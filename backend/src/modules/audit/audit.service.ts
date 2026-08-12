import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async findAll(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.auditRepo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC');

    if (query.actorId) {
      qb.andWhere('log.actorId = :actorId', { actorId: query.actorId });
    }
    if (query.tenantId) {
      qb.andWhere('log.tenantId = :tenantId', { tenantId: query.tenantId });
    }
    if (query.action) {
      qb.andWhere('log.action ILIKE :action', {
        action: `%${query.action}%`,
      });
    }
    if (query.from) {
      qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('log.createdAt <= :to', { to: new Date(query.to) });
    }

    const total = await qb.getCount();
    const logs = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const data = logs.map((log) => ({
      id: log.id,
      actorId: log.actorId,
      actorEmail: log.actorEmail,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      tenantId: log.tenantId,
      ipAddress: log.ipAddress,
      result: log.result,
      payload: log.payload,
      timestamp: log.createdAt.toISOString(),
    }));

    return paginate(data, total, page, limit);
  }
}
