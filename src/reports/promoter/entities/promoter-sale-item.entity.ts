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

@Entity('promoter_sale_items')
export class PromoterSaleItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'promoter_report_id' })
  promoterReportId: number;

  @ManyToOne(() => PromoterReport, (r) => r.saleItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promoter_report_id' })
  promoterReport: PromoterReport;

  @Column({ name: 'product_id', nullable: true })
  productId: number | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_name_raw', nullable: true })
  productNameRaw: string | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'promo_label', nullable: true })
  promoLabel: string | null;

  @Column({ name: 'is_offer', default: false })
  isOffer: boolean;

  @Column({ name: 'is_product_matched', default: false })
  isProductMatched: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
