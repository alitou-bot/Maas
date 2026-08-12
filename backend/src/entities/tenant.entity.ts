import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantStatus } from '../common/enums';
import { Plan } from './plan.entity';
import { User } from './user.entity';
import { Server } from './server.entity';
import { ServerGroup } from './server-group.entity';
import { Incident } from './incident.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  contactEmail: string;

  @Column({ type: 'uuid' })
  planId: string;

  @ManyToOne(() => Plan, (p) => p.tenants, { eager: true })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column({ type: 'int' })
  serverLimit: number;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Zabbix host group id for this tenant (JSON-RPC groupids). */
  @Column({ type: 'varchar', nullable: true })
  zabbixGroupId: string | null;

  @OneToMany(() => User, (u) => u.tenant)
  users: User[];

  @OneToMany(() => Server, (s) => s.tenant)
  servers: Server[];

  @OneToMany(() => ServerGroup, (g) => g.tenant)
  groups: ServerGroup[];

  @OneToMany(() => Incident, (i) => i.tenant)
  incidents: Incident[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
