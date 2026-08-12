import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { PasswordResetToken } from '../../entities/password-reset-token.entity';
import { UserStatus } from '../../common/enums';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetRepo: Repository<PasswordResetToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private toUserDto(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  private async signTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('app.jwtSecret') || 'maas-dev-secret',
      expiresIn: 8 * 60 * 60,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret:
          this.config.get<string>('app.jwtRefreshSecret') ||
          'maas-refresh-secret',
        expiresIn: 7 * 24 * 60 * 60,
      },
    );
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersRepo.update(user.id, { refreshTokenHash });
    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }
    user.lastLogin = new Date();
    await this.usersRepo.save(user);
    const tokens = await this.signTokens(user);
    return { ...tokens, user: this.toUserDto(user) };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; type?: string }>(
        dto.refreshToken,
        { secret: this.config.get<string>('app.jwtRefreshSecret') },
      );
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
      if (!user?.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const match = await bcrypt.compare(
        dto.refreshToken,
        user.refreshTokenHash,
      );
      if (!match) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException('Account suspended');
      }
      const tokens = await this.signTokens(user);
      return { ...tokens, user: this.toUserDto(user) };
    } catch (e) {
      if (
        e instanceof UnauthorizedException ||
        e instanceof ForbiddenException
      ) {
        throw e;
      }
      throw new UnauthorizedException('Expired or invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.usersRepo.update(userId, { refreshTokenHash: null });
    return { message: 'Logged out' };
  }

  async me(user: User) {
    const fresh = await this.usersRepo.findOne({
      where: { id: user.id },
      relations: { tenant: true },
    });
    const u = fresh ?? user;
    return {
      ...this.toUserDto(u),
      tenantName: u.tenant?.name ?? null,
      status: u.status,
      lastLogin: u.lastLogin?.toISOString() ?? null,
      createdAt: u.createdAt?.toISOString() ?? null,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.save(user);
    return { message: 'Password updated successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.resetRepo.save(
        this.resetRepo.create({
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          usedAt: null,
        }),
      );
      // In production, send email. Log token in development for testing.
      if (this.config.get('app.nodeEnv') !== 'production') {
        console.log(`[dev] Password reset token for ${user.email}: ${token}`);
      }
    }
    return { message: 'Check your email for a reset link' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.resetRepo.findOne({
      where: { token: dto.token },
      relations: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    record.user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    record.usedAt = new Date();
    await this.usersRepo.save(record.user);
    await this.resetRepo.save(record);
    return { message: 'Password updated' };
  }
}
