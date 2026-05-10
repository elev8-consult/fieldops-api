import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';
import {
  FlagSeverity,
  FlagStatus,
} from '../../common/enums/schema.enums';
import { User } from '../../users/entities/user.entity';
import { ParsedReport } from './parsed-report.entity';

@Entity('report_flags')
export class ReportFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_id', type: 'uuid' })
  reportId: string;

  @ManyToOne(() => ParsedReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: ParsedReport;

  @Column({ name: 'flag_code', type: 'varchar', length: 64 })
  flagCode: string;

  @Column({ name: 'field_name', type: 'varchar', length: 255, nullable: true })
  fieldName: string | null;

  @Column({
    type: 'enum',
    enum: FlagSeverity,
    enumName: 'flag_severity',
    // Audit fix: bind report_flags.severity to SQL flag_severity enum.
  })
  severity: FlagSeverity | string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: FlagStatus,
    enumName: 'flag_status',
    // Audit fix: bind report_flags.status to SQL flag_status enum.
  })
  status: FlagStatus | string;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedBy: User | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_brand_id', type: 'uuid', nullable: true })
  // Audit fix: mapped report_flags.resolved_brand_id nullable FK.
  resolvedBrandId: string | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'resolved_brand_id' })
  resolvedBrand: Brand | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
