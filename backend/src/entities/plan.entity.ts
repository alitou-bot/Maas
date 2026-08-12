import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'int' })
  maxServers: number;

  @Column({ type: 'int' })
  retentionDays: number;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceMonthly: number;

  @OneToMany(() => Tenant, (t) => t.plan)
  tenants: Tenant[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
