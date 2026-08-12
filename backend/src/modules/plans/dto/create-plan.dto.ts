import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  @Min(1)
  maxServers: number;

  @IsInt()
  @Min(1)
  retentionDays: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  features: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly: number;
}
