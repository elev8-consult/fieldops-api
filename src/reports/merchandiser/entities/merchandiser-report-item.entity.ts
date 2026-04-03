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

  @Column({ name: 'merchandiser_report_id', type: 'int' })
  merchandiserReportId: number;

  @ManyToOne(() => MerchandiserReport, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchandiser_report_id' })
  merchandiserReport: MerchandiserReport;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', type: 'varchar', length: 512, nullable: true })
  productNameRaw: string | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'expiry_raw', type: 'varchar', length: 255, nullable: true })
  expiryRaw: string | null;

  @Column({ name: 'is_product_matched', type: 'boolean', default: false })
  isProductMatched: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
