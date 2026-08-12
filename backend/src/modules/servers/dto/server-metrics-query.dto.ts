import { IsDateString, IsIn, IsString } from 'class-validator';

export class ServerMetricsQueryDto {
  @IsString()
  @IsIn(['cpu', 'memory', 'disk', 'network'])
  metric: 'cpu' | 'memory' | 'disk' | 'network';

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
