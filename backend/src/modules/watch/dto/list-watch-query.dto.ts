import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { WatchedEntityType } from '../../../common/enums';

export class ListWatchQueryDto {
  @IsOptional()
  @IsUUID()
  serverId?: string;

  @IsOptional()
  @IsEnum(WatchedEntityType)
  entityType?: WatchedEntityType;
}
