import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TenantStatus } from '../../../common/enums';

export class ListTenantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
