import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';
import {
  ParsedReportStatus,
  ReportType,
} from '../../common/enums/schema.enums';
import { Outlet } from '../../outlets/entities/outlet.entity';
import { MerchandiserReport } from '../../reports/merchandiser/entities/merchandiser-report.entity';
import { PromoterReport } from '../../reports/promoter/entities/promoter-report.entity';
import { User } from '../../users/entities/user.entity';
import { WhatsappMessage } from '../../messages/entities/whatsapp-message.entity';
import { ReportFlag } from './report-flag.entity';

@Entity('parsed_reports')
export class ParsedReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ManyToOne(() => WhatsappMessage)
  @JoinColumn({ name: 'message_id' })
  message: WhatsappMessage;

  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId: string | null;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'outlet_id', type: 'uuid', nullable: true })
  outletId: string | null;

  @ManyToOne(() => Outlet, { nullable: true })
  @JoinColumn({ name: 'outlet_id' })
  outlet: Outlet | null;

  @Column({ name: 'reported_by', type: 'uuid', nullable: true })
  reportedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reported_by' })
  reportedBy: User | null;

  @Column({ name: 'report_date', type: 'date', nullable: true })
  reportDate: string | null;

  @Column({
    name: 'report_type',
    type: 'enum',
    enum: ReportType,
    enumName: 'report_type',
    // Audit fix: bind parsed_reports.report_type to SQL report_type enum.
  })
  reportType: ReportType | string;

  @Column({
    type: 'enum',
    enum: ParsedReportStatus,
    enumName: 'parsed_report_status',
    // Audit fix: bind parsed_reports.status to SQL parsed_report_status enum.
  })
  status: ParsedReportStatus | string;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ name: 'location_raw', type: 'text', nullable: true })
  locationRaw: string | null;

  @Column({ name: 'date_raw', type: 'varchar', length: 512, nullable: true })
  dateRaw: string | null;

  @Column({ name: 'name_raw', type: 'varchar', length: 512, nullable: true })
  nameRaw: string | null;

  @Column({ name: 'is_depot_report', type: 'boolean', default: false })
  isDepotReport: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ReportFlag, (f) => f.report)
  flags: ReportFlag[];

  @OneToOne(() => PromoterReport, (promoterReport) => promoterReport.report)
  // Audit fix: enforce ParsedReport 1:1 PromoterReport inverse relation.
  promoterReport: PromoterReport | null;

  @OneToOne(
    () => MerchandiserReport,
    (merchandiserReport) => merchandiserReport.report,
  )
  // Audit fix: enforce ParsedReport 1:1 MerchandiserReport inverse relation.
  merchandiserReport: MerchandiserReport | null;
}
