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

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ name: 'whatsapp_phone', type: 'varchar', length: 64, nullable: true })
  whatsappPhone: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  // Audit fix: users.phone exists in schema and is used as a secondary contact field.
  phone: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

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
