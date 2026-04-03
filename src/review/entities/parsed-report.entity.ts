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
import { Brand } from '../../brands/entities/brand.entity';
import { Outlet } from '../../outlets/entities/outlet.entity';
import { User } from '../../users/entities/user.entity';
import { WhatsappMessage } from '../../messages/entities/whatsapp-message.entity';
import { ReportFlag } from './report-flag.entity';

@Entity('parsed_reports')
export class ParsedReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'message_id' })
  messageId: number;

  @ManyToOne(() => WhatsappMessage)
  @JoinColumn({ name: 'message_id' })
  message: WhatsappMessage;

  @Column({ name: 'brand_id' })
  brandId: number;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'outlet_id', nullable: true })
  outletId: number | null;

  @ManyToOne(() => Outlet, { nullable: true })
  @JoinColumn({ name: 'outlet_id' })
  outlet: Outlet | null;

  @Column({ name: 'reported_by', nullable: true })
  reportedById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reported_by' })
  reportedBy: User | null;

  @Column({ name: 'report_date', type: 'date', nullable: true })
  reportDate: string | null;

  @Column({ name: 'report_type', type: 'varchar', length: 32 })
  reportType: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ name: 'location_raw', type: 'text', nullable: true })
  locationRaw: string | null;

  @Column({ name: 'date_raw', nullable: true })
  dateRaw: string | null;

  @Column({ name: 'name_raw', nullable: true })
  nameRaw: string | null;

  @Column({ name: 'is_depot_report', default: false })
  isDepotReport: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ReportFlag, (f) => f.report)
  flags: ReportFlag[];
}
