import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { WatchedEntityType } from '../../../common/enums';

export class CreateWatchDto {
  @IsEnum(WatchedEntityType)
  entityType: WatchedEntityType;

  @IsUUID()
  serverId: string;

  @IsString()
  @MinLength(1)
  entityName: string;

  /** Port for services, zabbixHostId for network devices, ifName for interfaces. */
  @IsOptional()
  @IsObject()
  entityMeta?: Record<string, unknown>;
}
