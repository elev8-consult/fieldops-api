import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../../products/entities/product.entity';
import { PromoterReport } from './promoter-report.entity';

@Entity('promoter_sample_items')
export class PromoterSampleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'promoter_report_id', type: 'int' })
  promoterReportId: number;

  @ManyToOne(() => PromoterReport, (r) => r.sampleItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promoter_report_id' })
  promoterReport: PromoterReport;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', type: 'varchar', length: 512, nullable: true })
  productNameRaw: string | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'availability_note', type: 'text', nullable: true })
  availabilityNote: string | null;

  @Column({ name: 'is_product_matched', type: 'boolean', default: false })
  isProductMatched: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
