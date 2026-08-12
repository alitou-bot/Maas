import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentSeverity } from '../../../common/enums';

export class IncidentWebhookDto {
  @IsOptional()
  @IsString()
  zabbixEventId?: string;

  @IsString()
  hostname: string;

  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsDateString()
  triggeredAt?: string;
}
