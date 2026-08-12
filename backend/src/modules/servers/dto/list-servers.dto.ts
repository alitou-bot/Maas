import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ServerStatus } from '../../../common/enums';

export class ListServersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ServerStatus)
  status?: ServerStatus;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}
