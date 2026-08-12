import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Brackets, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination.dto';
import { UserRole, UserStatus } from '../../common/enums';
import { sanitizeUser } from '../../common/utils/sanitize-user';
import { PasswordResetToken } from '../../entities/password-reset-token.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const PLATFORM_ROLES = [UserRole.SUPER_ADMIN, UserRole.NOC_OPERATOR];
const TENANT_ASSIGNABLE_ROLES = [
  UserRole.TENANT_ADMIN,
  UserRole.CLIENT_VIEWER,
];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantsRepo: Repository<Tenant>,
    @InjectRepository(PasswordResetToken)
    private readonly resetRepo: Repository<PasswordResetToken>,
    private readonly config: ConfigService,
  ) {}

  private generateTempPassword(): string {
    return randomBytes(12).toString('base64url');
  }

  private assertCanAccessUser(actor: User, target: User) {
    if (actor.id === target.id) {
      return;
    }

    if (actor.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (
      actor.role === UserRole.TENANT_ADMIN &&
      actor.tenantId &&
      target.tenantId === actor.tenantId
    ) {
      return;
    }

    throw new ForbiddenException('You do not have access to this user');
  }

  private assertTenantAdminOwnsTarget(actor: User, target: User) {
    if (actor.role !== UserRole.TENANT_ADMIN) {
      return;
    }
    if (!actor.tenantId || target.tenantId !== actor.tenantId) {
      throw new ForbiddenException('You do not have access to this user');
    }
  }

  async findAll(actor: User, query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.usersRepo.createQueryBuilder('user');

    if (actor.role === UserRole.TENANT_ADMIN) {
      if (!actor.tenantId) {
        throw new ForbiddenException('User has no tenant association');
      }
      qb.andWhere('user.tenantId = :tenantId', { tenantId: actor.tenantId });
    } else if (query.tenantId) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('user.firstName ILIKE :term', { term })
            .orWhere('user.lastName ILIKE :term', { term })
            .orWhere('user.email ILIKE :term', { term });
        }),
      );
    }

    qb.orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [users, total] = await qb.getManyAndCount();
    return paginate(users.map(sanitizeUser), total, page, limit);
  }

  async create(actor: User, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    let tenantId = dto.tenantId ?? null;
    let role = dto.role;

    if (actor.role === UserRole.TENANT_ADMIN) {
      if (!actor.tenantId) {
        throw new ForbiddenException('User has no tenant association');
      }
      if (!TENANT_ASSIGNABLE_ROLES.includes(role)) {
        throw new ForbiddenException(
          'Tenant admins can only create TENANT_ADMIN or CLIENT_VIEWER users',
        );
      }
      tenantId = actor.tenantId;
    } else if (role === UserRole.TENANT_ADMIN || role === UserRole.CLIENT_VIEWER) {
      if (!tenantId) {
        throw new BadRequestException(
          'tenantId is required for tenant-scoped roles',
        );
      }
      const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
    } else {
      tenantId = null;
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = this.usersRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      role,
      tenantId,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    const saved = await this.usersRepo.save(user);

    // Email delivery is not wired yet — always log and return the temp password
    // so admins can share credentials. Replace with SMTP when available.
    console.log(
      `[dev] Created user ${saved.email} — temp password: ${tempPassword}` +
        (dto.sendWelcomeEmail ? ' (welcome email skipped: SMTP not configured)' : ''),
    );

    return {
      ...sanitizeUser(saved),
      temporaryPassword: tempPassword,
    };
  }

  async findOne(actor: User, userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.assertCanAccessUser(actor, user);
    return sanitizeUser(user);
  }

  async update(actor: User, userId: string, dto: UpdateUserDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSelf = actor.id === user.id;

    if (isSelf) {
      const allowed = ['firstName', 'lastName', 'password'] as const;
      const keys = Object.keys(dto).filter(
        (k) => dto[k as keyof UpdateUserDto] !== undefined,
      );
      const invalid = keys.filter(
        (k) => !allowed.includes(k as (typeof allowed)[number]),
      );
      if (invalid.length > 0) {
        throw new ForbiddenException(
          'You can only update firstName, lastName, and password on your own account',
        );
      }
    } else if (actor.role === UserRole.TENANT_ADMIN) {
      this.assertTenantAdminOwnsTarget(actor, user);
      const allowed = ['role'] as const;
      const keys = Object.keys(dto).filter(
        (k) => dto[k as keyof UpdateUserDto] !== undefined,
      );
      const invalid = keys.filter(
        (k) => !allowed.includes(k as (typeof allowed)[number]),
      );
      if (invalid.length > 0) {
        throw new ForbiddenException(
          'Tenant admins can only update the role field for users in their tenant',
        );
      }
      if (dto.role && !TENANT_ASSIGNABLE_ROLES.includes(dto.role)) {
        throw new ForbiddenException(
          'Tenant admins can only assign TENANT_ADMIN or CLIENT_VIEWER roles',
        );
      }
    } else if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient role privileges');
    }

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const existing = await this.usersRepo.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) {
        throw new ConflictException('Email already exists');
      }
      user.email = dto.email.toLowerCase();
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.password !== undefined) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.tenantId !== undefined && actor.role === UserRole.SUPER_ADMIN) {
      if (
        dto.tenantId &&
        (dto.role === UserRole.TENANT_ADMIN ||
          dto.role === UserRole.CLIENT_VIEWER ||
          user.role === UserRole.TENANT_ADMIN ||
          user.role === UserRole.CLIENT_VIEWER)
      ) {
        const tenant = await this.tenantsRepo.findOne({
          where: { id: dto.tenantId },
        });
        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }
      }
      user.tenantId = dto.tenantId;
      if (
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.NOC_OPERATOR
      ) {
        user.tenantId = null;
      }
    }

    const saved = await this.usersRepo.save(user);
    return sanitizeUser(saved);
  }

  async remove(actor: User, userId: string) {
    if (actor.id === userId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (actor.role === UserRole.TENANT_ADMIN) {
      this.assertTenantAdminOwnsTarget(actor, user);
      if (PLATFORM_ROLES.includes(user.role)) {
        throw new ForbiddenException('Cannot delete platform admin users');
      }
    } else if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Insufficient role privileges');
    }

    await this.usersRepo.remove(user);
  }

  async resetPassword(actor: User, userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (actor.role === UserRole.TENANT_ADMIN) {
      this.assertTenantAdminOwnsTarget(actor, user);
    }

    const token = randomBytes(32).toString('hex');
    await this.resetRepo.save(
      this.resetRepo.create({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      }),
    );

    if (this.config.get('app.nodeEnv') !== 'production') {
      console.log(`[dev] Password reset token for ${user.email}: ${token}`);
    }

    return { message: 'Reset email sent' };
  }
}
