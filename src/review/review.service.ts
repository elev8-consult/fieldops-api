import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ParsedReport } from './entities/parsed-report.entity';
import { ReportFlag }   from './entities/report-flag.entity';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ParsedReport)
    private reportsRepo: Repository<ParsedReport>,

    @InjectRepository(ReportFlag)
    private flagsRepo: Repository<ReportFlag>,
    private dataSource: DataSource,
  ) {}

  // ── Review Queue ──────────────────────────────────────────────────
  async getQueue(filters: {
    brandId?:    string;
    reportType?: string;
    status?:     string;
    page?:       number;
    limit?:      number;
  }) {
    const {
      brandId,
      reportType,
      status = 'flagged',
      page   = 1,
      limit  = 20,
    } = filters;

    const query = this.reportsRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status })
      .orderBy('r.created_at', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (brandId)    query.andWhere('r.brand_id = :brandId',       { brandId });
    if (reportType) query.andWhere('r.report_type = :reportType', { reportType });

    const [reports, total] = await query.getManyAndCount();

    const reportsWithFlags = await Promise.all(
      reports.map(async (report) => {
        const flags = await this.flagsRepo.find({
          where: {
            reportId: report.id,
            status: 'open',
          },
          order: {
            createdAt: 'DESC',
          },
        });
        return { ...report, flags };
      }),
    );

    return { data: reportsWithFlags, total, page, limit };
  }

  // ── Single Report with all details ───────────────────────────────
  async getReport(id: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new BadRequestException(`Invalid report ID format: "${id}"`);
    }

  const report = await this.reportsRepo.findOne({
    where: { id: id as unknown as ParsedReport['id'] },
  });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

  const flags = await this.flagsRepo.find({
    where: { reportId: id as unknown as ReportFlag['reportId'] },
    order: { createdAt: 'DESC' },
  });

    const messageRows = await this.dataSource.query(
      `SELECT id, body_raw, body_normalized, ai_extraction, ai_classification,
              ai_confidence, message_type, sender_phone, sender_name, received_at
       FROM whatsapp_messages WHERE id = $1`,
      [report.messageId],
    );

    const brandRows = report.brandId
      ? await this.dataSource.query(
          `SELECT id, name, slug FROM brands WHERE id = $1`,
          [report.brandId],
        )
      : [];

    const outletRows = report.outletId
      ? await this.dataSource.query(
          `SELECT id, name, type, is_depot FROM outlets WHERE id = $1`,
          [report.outletId],
        )
      : [];

    let reportData = null;

    if (report.reportType === 'merchandiser') {
      const rows = await this.dataSource.query(
        `SELECT
           mr.id, mr.promo_type, mr.notes,
           COALESCE(
             json_agg(json_build_object(
               'id',                 mri.id,
               'product_name_raw',   mri.product_name_raw,
               'product_id',         mri.product_id,
               'quantity',           mri.quantity,
               'expiry_date',        mri.expiry_date,
               'expiry_raw',         mri.expiry_raw,
               'is_product_matched', mri.is_product_matched
             ) ORDER BY mri.created_at)
             FILTER (WHERE mri.id IS NOT NULL),
             '[]'
           ) AS items
         FROM merchandiser_reports mr
         LEFT JOIN merchandiser_report_items mri
           ON mri.merchandiser_report_id = mr.id
         WHERE mr.report_id = $1
         GROUP BY mr.id`,
        [id],
      );
      reportData = rows[0] ?? null;
    }

    if (report.reportType === 'promoter') {
      const rows = await this.dataSource.query(
        `SELECT
           pr.id, pr.promo_stand_placement, pr.persons_contacted,
           pr.persons_tasted, pr.feedback_text, pr.most_asked_question,
           pr.questions_answers,
           COALESCE(
             (SELECT json_agg(json_build_object(
               'id',                 s.id,
               'product_name_raw',   s.product_name_raw,
               'product_id',         s.product_id,
               'quantity',           s.quantity,
               'promo_label',        s.promo_label,
               'is_offer',           s.is_offer,
               'is_product_matched', s.is_product_matched
             ) ORDER BY s.created_at)
             FROM promoter_sale_items s WHERE s.promoter_report_id = pr.id),
             '[]'
           ) AS sales,
           COALESCE(
             (SELECT json_agg(json_build_object(
               'id',                 si.id,
               'product_name_raw',   si.product_name_raw,
               'product_id',         si.product_id,
               'quantity',           si.quantity,
               'availability_note',  si.availability_note,
               'is_product_matched', si.is_product_matched
             ) ORDER BY si.created_at)
             FROM promoter_sample_items si WHERE si.promoter_report_id = pr.id),
             '[]'
           ) AS samples
         FROM promoter_reports pr
         WHERE pr.report_id = $1`,
        [id],
      );
      reportData = rows[0] ?? null;
    }

    return {
      ...report,
      flags,
      message:    messageRows[0]  ?? null,
      brand:      brandRows[0]    ?? null,
      outlet:     outletRows[0]   ?? null,
      reportData,
    };
  }

  // ── Approve Report ────────────────────────────────────────────────
  async approve(id: string, userId: number) {
    const report = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
    });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    await this.reportsRepo.update(
      { id: id as unknown as ParsedReport['id'] },
      { status: 'approved' },
    );

    const openFlags = await this.flagsRepo.find({
      where: {
        reportId: id as unknown as ReportFlag['reportId'],
        status: 'open',
      },
    });

    await Promise.all(
      openFlags.map((flag) =>
        this.flagsRepo.update(flag.id, {
          status:       'resolved',
          resolvedById: userId,
          resolvedAt:   new Date(),
        }),
      ),
    );

    return this.getReport(id);
  }

  // ── Reject Report ─────────────────────────────────────────────────
  async reject(id: string) {
    const report = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
    });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    await this.reportsRepo.update(
      { id: id as unknown as ParsedReport['id'] },
      { status: 'rejected' },
    );

    return this.getReport(id);
  }

  // ── Update Report Fields ──────────────────────────────────────────
  async update(id: string, data: Partial<ParsedReport>) {
    const report = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
    });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    const { id: _id, createdAt: _c, ...updateData } = data as any;

    await this.reportsRepo.update(
      { id: id as unknown as ParsedReport['id'] },
      {
        ...updateData,
        status: 'pending_review',
      },
    );

    const updated = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
      relations: ['brand', 'outlet', 'flags', 'reportedBy'],
    });
    if (!updated) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return updated;
  }

  // ── Resolve Flag ──────────────────────────────────────────────────
  async resolveFlag(flagId: string, userId: number) {
    const flag = await this.flagsRepo.findOne({
      where: { id: flagId as unknown as ReportFlag['id'] },
    });
    if (!flag) throw new NotFoundException(`Flag ${flagId} not found`);

    await this.flagsRepo.update(
      { id: flagId as unknown as ReportFlag['id'] },
      {
        status:       'resolved',
        resolvedById: userId,
        resolvedAt:   new Date(),
      },
    );

    return this.flagsRepo.findOne({
      where: { id: flagId as unknown as ReportFlag['id'] },
    });
  }

  // ── Dismiss Flag ──────────────────────────────────────────────────
  async dismissFlag(flagId: string, userId: number) {
    const flag = await this.flagsRepo.findOne({
      where: { id: flagId as unknown as ReportFlag['id'] },
    });
    if (!flag) throw new NotFoundException(`Flag ${flagId} not found`);

    await this.flagsRepo.update(
      { id: flagId as unknown as ReportFlag['id'] },
      {
        status:       'dismissed',
        resolvedById: userId,
        resolvedAt:   new Date(),
      },
    );

    return this.flagsRepo.findOne({
      where: { id: flagId as unknown as ReportFlag['id'] },
    });
  }

  // ── Get Queue Count (for sidebar badge) ──────────────────────────
  async getQueueCount(brandId?: string): Promise<number> {
    const query = this.reportsRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'flagged' });

    if (brandId) {
      const bid = parseInt(brandId, 10);
      if (!Number.isNaN(bid)) {
        query.andWhere('r.brand_id = :brandId', { brandId: bid });
      }
    }

    return query.getCount();
  }
}
