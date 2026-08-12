import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../common/enums';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;

  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @ValidateIf(
    (o: CreateUserDto) =>
      o.role === UserRole.TENANT_ADMIN || o.role === UserRole.CLIENT_VIEWER,
  )
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsBoolean()
  sendWelcomeEmail?: boolean;
}
