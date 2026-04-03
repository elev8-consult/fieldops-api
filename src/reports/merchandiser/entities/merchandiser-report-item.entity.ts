import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../../products/entities/product.entity';
import { MerchandiserReport } from './merchandiser-report.entity';

@Entity('merchandiser_report_items')
export class MerchandiserReportItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'merchandiser_report_id' })
  merchandiserReportId: number;

  @ManyToOne(() => MerchandiserReport, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchandiser_report_id' })
  merchandiserReport: MerchandiserReport;

  @Column({ name: 'product_id', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', nullable: true })
  productNameRaw: string | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'expiry_raw', nullable: true })
  expiryRaw: string | null;

  @Column({ name: 'is_product_matched', default: false })
  isProductMatched: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
