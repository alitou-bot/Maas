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
import { ServerStatus } from '../common/enums';
import { Tenant } from './tenant.entity';
import { ServerGroup } from './server-group.entity';
import { Incident } from './incident.entity';

@Entity('servers')
export class Server {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, (t) => t.servers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column()
  hostname: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column()
  os: string;

  @Column({ type: 'uuid', nullable: true })
  groupId: string | null;

  @ManyToOne(() => ServerGroup, (g) => g.servers, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'groupId' })
  group: ServerGroup | null;

  @Column({ type: 'enum', enum: ServerStatus, default: ServerStatus.UNKNOWN })
  status: ServerStatus;

  @Column({ type: 'float', default: 0 })
  cpuPercent: number;

  @Column({ type: 'float', default: 0 })
  memPercent: number;

  @Column({ type: 'float', default: 0 })
  diskPercent: number;

  @Column({ type: 'bigint', default: 0 })
  uptime: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheck: Date | null;

  @Column({ type: 'varchar', nullable: true })
  zabbixHostId: string | null;

  /** Zabbix network discovery rule for this server's LAN scan. */
  @Column({ type: 'varchar', nullable: true })
  discoveryRuleId: string | null;

  @Column({ type: 'varchar', nullable: true })
  pskIdentity: string | null;

  @Column({ type: 'varchar', nullable: true })
  pskKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  installToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ default: false })
  tokenUsed: boolean;

  @Column({ type: 'varchar', default: 'PENDING' })
  installStatus: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => Incident, (i) => i.server)
  incidents: Incident[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
