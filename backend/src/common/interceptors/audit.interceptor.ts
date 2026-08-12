import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { User } from '../../entities/user.entity';
import { UserRole } from '../enums';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: User;
      ip?: string;
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    }>();

    const method = request.method.toUpperCase();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    if (
      !user ||
      (user.role !== UserRole.SUPER_ADMIN &&
        user.role !== UserRole.TENANT_ADMIN)
    ) {
      return next.handle();
    }

    // Skip auth login/logout noise and webhook
    if (request.url.includes('/auth/') || request.url.includes('/webhook')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          void this.writeLog(request, user, 'Success');
        },
        error: () => {
          void this.writeLog(request, user, 'Failed');
        },
      }),
    );
  }

  private async writeLog(
    request: {
      method: string;
      url: string;
      ip?: string;
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    },
    user: User,
    result: string,
  ) {
    const segments = request.url.split('?')[0].split('/').filter(Boolean);
    // /api/v1/tenants/:id → resourceType = tenants
    const apiIdx = segments.indexOf('v1');
    const resourceType = segments[apiIdx + 1] || 'unknown';
    const resourceId =
      request.params?.id ||
      request.params?.tenantId ||
      request.params?.userId ||
      request.params?.serverId ||
      request.params?.incidentId ||
      request.params?.planId ||
      request.params?.groupId ||
      request.params?.reportId ||
      null;

    const safeBody = { ...(request.body || {}) };
    delete safeBody.password;
    delete safeBody.newPassword;
    delete safeBody.refreshToken;

    await this.auditRepo.save(
      this.auditRepo.create({
        actorId: user.id,
        actorEmail: user.email,
        action: `${request.method} ${resourceType}`,
        resourceType,
        resourceId,
        tenantId: user.tenantId,
        ipAddress: request.ip || null,
        result,
        payload: safeBody,
      }),
    );
  }
}
