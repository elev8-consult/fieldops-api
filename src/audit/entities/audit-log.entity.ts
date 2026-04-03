import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 128 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'int' })
  entityId: number;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ name: 'field_name', type: 'varchar', length: 255, nullable: true })
  fieldName: string | null;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
