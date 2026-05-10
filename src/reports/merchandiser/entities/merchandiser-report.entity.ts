import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ParsedReport } from '../../../review/entities/parsed-report.entity';
import { MerchandiserReportItem } from './merchandiser-report-item.entity';

@Entity('merchandiser_reports')
export class MerchandiserReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_id', type: 'uuid', unique: true })
  reportId: string;

  @OneToOne(() => ParsedReport, (parsedReport) => parsedReport.merchandiserReport)
  @JoinColumn({ name: 'report_id' })
  // Audit fix: relation parity requires merchandiserReport.report inverse to parsedReport.merchandiserReport.
  report: ParsedReport;

  @Column({ name: 'promo_type', type: 'varchar', length: 100, nullable: true })
  promoType: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => MerchandiserReportItem, (i) => i.merchandiserReport)
  items: MerchandiserReportItem[];
}
