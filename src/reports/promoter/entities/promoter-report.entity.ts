import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ParsedReport } from '../../../review/entities/parsed-report.entity';
import { PromoterSaleItem } from './promoter-sale-item.entity';
import { PromoterSampleItem } from './promoter-sample-item.entity';

@Entity('promoter_reports')
export class PromoterReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'report_id', type: 'int', unique: true })
  reportId: number;

  @OneToOne(() => ParsedReport)
  @JoinColumn({ name: 'report_id' })
  parsedReport: ParsedReport;

  @Column({ name: 'promo_stand_placement', type: 'text', nullable: true })
  promoStandPlacement: string | null;

  @Column({ name: 'persons_contacted', type: 'int', nullable: true })
  personsContacted: number | null;

  @Column({ name: 'persons_tasted', type: 'int', nullable: true })
  personsTasted: number | null;

  @Column({ name: 'feedback_text', type: 'text', nullable: true })
  feedbackText: string | null;

  @Column({ name: 'most_asked_question', type: 'text', nullable: true })
  mostAskedQuestion: string | null;

  @Column({ name: 'questions_answers', type: 'jsonb', nullable: true })
  questionsAnswers: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => PromoterSaleItem, (s) => s.promoterReport)
  saleItems: PromoterSaleItem[];

  @OneToMany(() => PromoterSampleItem, (s) => s.promoterReport)
  sampleItems: PromoterSampleItem[];
}
