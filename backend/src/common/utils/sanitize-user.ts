import { UserRole, UserStatus } from '../enums';
import { User } from '../../entities/user.entity';

export interface SanitizedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  status: UserStatus;
  lastLogin: Date | null;
  createdAt: Date;
}

export function sanitizeUser(user: User): SanitizedUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    status: user.status,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
}
