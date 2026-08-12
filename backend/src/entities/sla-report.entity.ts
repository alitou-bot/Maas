import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportFormat } from '../common/enums';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('sla_reports')
export class SlaReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'enum', enum: ReportFormat })
  format: ReportFormat;

  @Column()
  filePath: string;

  @Column({ type: 'timestamptz' })
  generatedAt: Date;

  @Column({ type: 'uuid' })
  generatedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'generatedByUserId' })
  generatedBy: User;
}
