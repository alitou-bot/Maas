import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateServerDto {
  /** Required for SUPER_ADMIN; ignored for TENANT_ADMIN (JWT tenantId wins). */
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsNotEmpty()
  @IsString()
  os: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
