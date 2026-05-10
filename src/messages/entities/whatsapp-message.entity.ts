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
import {
  MessageStatus,
  ReportType,
} from '../../common/enums/schema.enums';
import { ParsedReport } from '../../review/entities/parsed-report.entity';
import { User } from '../../users/entities/user.entity';

@Entity('whatsapp_messages')
export class WhatsappMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wa_message_id', type: 'varchar', length: 255, unique: true })
  waMessageId: string;

  @Column({ name: 'wa_group_id', type: 'varchar', length: 255, nullable: true })
  // Audit fix: mapped whatsapp_messages.wa_group_id from schema inventory.
  waGroupId: string | null;

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

  @Column({
    name: 'report_type',
    type: 'enum',
    enum: ReportType,
    enumName: 'report_type',
    // Audit fix: bind message report_type to SQL report_type enum.
  })
  reportType: ReportType;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    enumName: 'message_status',
    // Audit fix: bind message status to SQL message_status enum.
  })
  status: MessageStatus;

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

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedBy: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ParsedReport, (report) => report.message)
  // Audit fix: enforce WhatsappMessage 1:N ParsedReport relation.
  reports: ParsedReport[];
}
