import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IncidentSeverity } from '../common/enums';
import { Tenant } from './tenant.entity';

@Entity('notification_settings')
export class NotificationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = system-level settings */
  @Column({ type: 'uuid', nullable: true, unique: true })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant | null;

  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ type: 'jsonb', default: [] })
  emailRecipients: string[];

  @Column({ type: 'text', nullable: true })
  slackWebhookUrl: string | null;

  @Column({ type: 'text', nullable: true })
  discordWebhookUrl: string | null;

  @Column({
    type: 'enum',
    enum: IncidentSeverity,
    default: IncidentSeverity.WARNING,
  })
  minSeverity: IncidentSeverity;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
