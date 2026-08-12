import {
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateServerDto {
  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
