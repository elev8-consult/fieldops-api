import {
  OneToMany,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../common/enums/schema.enums';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { Brand } from '../../brands/entities/brand.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({
    name: 'whatsapp_phone',
    type: 'varchar',
    length: 30,
    nullable: true,
    unique: true,
  })
  whatsappPhone: string | null;

  @Column({ type: 'varchar', length: 150, unique: true, nullable: true })
  email: string | null;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
    nullable: true,
  })
  passwordHash: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    // Audit fix: bind role to SQL enum user_role to avoid duplicate enum migrations.
  })
  role: string;

  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId: string | null;

  @ManyToOne(() => Brand, (brand) => brand.users, { nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => AuditLog, (auditLog) => auditLog.user)
  // Audit fix: enforce User 1:N AuditLog bidirectional relation.
  auditLogs: AuditLog[];
}
