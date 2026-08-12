import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateGroupDto {
  /** Required for SUPER_ADMIN; ignored for TENANT_ADMIN (JWT tenantId wins). */
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  name: string;
}
