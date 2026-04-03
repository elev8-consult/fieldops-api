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
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'report_id', type: 'int', unique: true })
  reportId: number;

  @OneToOne(() => ParsedReport)
  @JoinColumn({ name: 'report_id' })
  parsedReport: ParsedReport;

  @Column({ name: 'promo_type', type: 'varchar', length: 255, nullable: true })
  promoType: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => MerchandiserReportItem, (i) => i.merchandiserReport)
  items: MerchandiserReportItem[];
}
