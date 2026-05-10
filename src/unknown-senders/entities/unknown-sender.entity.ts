import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';

@Entity('unknown_senders')
export class UnknownSender {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sender_phone', type: 'varchar', length: 30, unique: true })
  senderPhone: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 150, nullable: true })
  senderName: string | null;

  @Column({ name: 'seen_count', type: 'int', default: 1 })
  seenCount: number;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'resolved_brand_id', type: 'uuid', nullable: true })
  resolvedBrandId: string | null;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'resolved_brand_id' })
  resolvedBrand: Brand | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
