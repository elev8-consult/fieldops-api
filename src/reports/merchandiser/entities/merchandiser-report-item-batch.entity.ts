import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MerchandiserReportItem } from './merchandiser-report-item.entity';

@Entity('merchandiser_report_item_batches')
export class MerchandiserReportItemBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_item_id', type: 'uuid' })
  reportItemId: string;

  @ManyToOne(() => MerchandiserReportItem, (item) => item.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_item_id' })
  reportItem: MerchandiserReportItem;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'expiry_raw', type: 'varchar', length: 50, nullable: true })
  expiryRaw: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
