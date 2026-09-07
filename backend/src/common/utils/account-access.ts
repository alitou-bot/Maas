import { ForbiddenException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '../enums';
import { User } from '../../entities/user.entity';

export function assertAccountActive(user: User): void {
  if (user.status === UserStatus.SUSPENDED) {
    throw new ForbiddenException('Account suspended');
  }
  if (user.tenantId && user.tenant?.status === TenantStatus.SUSPENDED) {
    throw new ForbiddenException('Organization suspended');
  }
}

export function isAccountActive(user: User): boolean {
  if (user.status === UserStatus.SUSPENDED) {
    return false;
  }
  if (user.tenantId && user.tenant?.status === TenantStatus.SUSPENDED) {
    return false;
  }
  return true;
}
