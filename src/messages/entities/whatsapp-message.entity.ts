import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('whatsapp_messages')
export class WhatsappMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'wa_message_id', type: 'varchar', length: 255, unique: true })
  waMessageId: string;

  @Column({ name: 'sender_phone', type: 'varchar', length: 64 })
  senderPhone: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
  senderName: string | null;

  @Column({ name: 'body_raw', type: 'text', nullable: true })
  bodyRaw: string | null;

  @Column({ name: 'body_normalized', type: 'text', nullable: true })
  bodyNormalized: string | null;

  @Column({ name: 'message_type', type: 'varchar', length: 32, nullable: true })
  messageType: string | null;

  @Column({ name: 'has_media', type: 'boolean', default: false })
  hasMedia: boolean;

  @Column({ name: 'report_type', type: 'varchar', length: 32 })
  reportType: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'ai_classification', type: 'jsonb', nullable: true })
  aiClassification: Record<string, unknown> | null;

  @Column({ name: 'ai_extraction', type: 'jsonb', nullable: true })
  aiExtraction: Record<string, unknown> | null;

  @Column({ name: 'ai_confidence', type: 'float', nullable: true })
  aiConfidence: number | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'reviewed_by', type: 'int', nullable: true })
  reviewedById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedBy: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
