import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, SKIP_TENANT_KEY } from '../decorators';
import { UserRole } from '../enums';
import { User } from '../../entities/user.entity';

/**
 * For TENANT_ADMIN / CLIENT_VIEWER:
 * - injects tenantFilterId from JWT
 * - blocks access to other tenants via :tenantId or ?tenantId
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{
      user: User;
      params: Record<string, string>;
      query: Record<string, string>;
      tenantFilterId?: string | null;
    }>();

    const user = request.user;
    if (!user) return true;

    const isTenantScoped =
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.CLIENT_VIEWER;

    if (!isTenantScoped) {
      request.tenantFilterId = null;
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('User has no tenant association');
    }

    request.tenantFilterId = user.tenantId;

    const paramTenantId = request.params?.tenantId;
    const queryTenantId = request.query?.tenantId;

    if (paramTenantId && paramTenantId !== user.tenantId) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }
    if (queryTenantId && queryTenantId !== user.tenantId) {
      throw new ForbiddenException(
        "You do not have access to this tenant's data",
      );
    }

    return true;
  }
}
