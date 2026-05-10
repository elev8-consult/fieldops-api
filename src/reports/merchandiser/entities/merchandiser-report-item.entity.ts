import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../../products/entities/product.entity';
import { MerchandiserReportItemBatch } from './merchandiser-report-item-batch.entity';
import { MerchandiserReport } from './merchandiser-report.entity';

@Entity('merchandiser_report_items')
export class MerchandiserReportItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchandiser_report_id', type: 'uuid' })
  merchandiserReportId: string;

  @ManyToOne(() => MerchandiserReport, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchandiser_report_id' })
  merchandiserReport: MerchandiserReport;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', type: 'varchar', length: 300 })
  productNameRaw: string;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'expiry_raw', type: 'varchar', length: 50, nullable: true })
  expiryRaw: string | null;

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

  @OneToMany(() => MerchandiserReportItemBatch, (batch) => batch.reportItem)
  batches: MerchandiserReportItemBatch[];
}
