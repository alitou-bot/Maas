import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WatchedEntityType, WatchStatus } from '../common/enums';
import { Server } from './server.entity';
import { User } from './user.entity';

@Entity('watched_entities')
export class WatchedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** MAAS server row (monitoring host). */
  @Column({ type: 'uuid' })
  serverId: string;

  @ManyToOne(() => Server, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serverId' })
  server: Server;

  @Column({ type: 'enum', enum: WatchedEntityType })
  entityType: WatchedEntityType;

  /** Display name / primary key (container name, process name, port, device name). */
  @Column()
  entityName: string;

  /** Optional JSON: port number, zabbix network host id, metric key, etc. */
  @Column({ type: 'jsonb', nullable: true })
  entityMeta: Record<string, unknown> | null;

  @Column({ type: 'varchar' })
  zabbixHostId: string;

  @Column({ type: 'varchar', nullable: true })
  zabbixItemKeyDown: string | null;

  @Column({ type: 'varchar', nullable: true })
  zabbixItemKeyRemoved: string | null;

  @Column({ type: 'varchar', nullable: true })
  zabbixTriggerIdDown: string | null;

  @Column({ type: 'varchar', nullable: true })
  zabbixTriggerIdRemoved: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastEventIdDown: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastEventIdRemoved: string | null;

  @Column({ type: 'enum', enum: WatchStatus, default: WatchStatus.ACTIVE })
  status: WatchStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
