import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentSeverity, NotificationChannel } from '../../../common/enums';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  emailRecipients?: string[];

  @IsOptional()
  @IsString()
  slackWebhookUrl?: string | null;

  @IsOptional()
  @IsString()
  discordWebhookUrl?: string | null;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  minSeverity?: IncidentSeverity;
}

export class TestNotificationDto {
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;
}
