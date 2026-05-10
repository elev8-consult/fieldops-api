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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'promoter_report_id', type: 'uuid' })
  promoterReportId: string;

  @ManyToOne(() => PromoterReport, (r) => r.sampleItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promoter_report_id' })
  promoterReport: PromoterReport;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', type: 'varchar', length: 300 })
  productNameRaw: string;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'availability_note', type: 'varchar', length: 150, nullable: true })
  availabilityNote: string | null;

  @Column({ name: 'is_product_matched', type: 'boolean', default: false })
  isProductMatched: boolean;

  @Column({
    name: 'match_confidence',
    type: 'decimal',
    precision: 4,
    scale: 3,
    nullable: true,
  })
  matchConfidence: number | null;

  @Column({ name: 'match_type', type: 'varchar', length: 20, nullable: true })
  matchType: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
