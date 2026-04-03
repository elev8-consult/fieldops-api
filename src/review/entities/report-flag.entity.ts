import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ParsedReport } from './parsed-report.entity';

@Entity('report_flags')
export class ReportFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'report_id', type: 'int' })
  reportId: number;

  @ManyToOne(() => ParsedReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report: ParsedReport;

  @Column({ name: 'flag_code', type: 'varchar', length: 64 })
  flagCode: string;

  @Column({ name: 'field_name', type: 'varchar', length: 255, nullable: true })
  fieldName: string | null;

  @Column({ type: 'varchar', length: 16 })
  severity: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'resolved_by', type: 'int', nullable: true })
  resolvedById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedBy: User | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
