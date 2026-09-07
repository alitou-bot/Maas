import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateServerDto {
  /** Ignored — tenant is taken from the authenticated TENANT_ADMIN JWT. */
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
