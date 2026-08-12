import { IsEnum } from 'class-validator';
import { TenantStatus } from '../../../common/enums';

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status: TenantStatus;
}
