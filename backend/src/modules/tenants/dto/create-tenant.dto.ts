import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  contactEmail: string;

  @IsUUID()
  planId: string;

  @IsInt()
  @Min(1)
  serverLimit: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
