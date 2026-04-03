import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { WhatsappMessage }  from '../messages/entities/whatsapp-message.entity';
import { ParsedReport }     from './entities/parsed-report.entity';
import { ReportFlag }       from './entities/report-flag.entity';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ParsedReport)
    private reportsRepo: Repository<ParsedReport>,

    @InjectRepository(ReportFlag)
    private flagsRepo: Repository<ReportFlag>,

    @InjectRepository(WhatsappMessage)
    private msgRepo: Repository<WhatsappMessage>,
  ) {}

  private assertReportUuid(id: string) {
    if (!UUID_V4_REGEX.test(id)) {
      throw new BadRequestException(
        `Invalid report ID format: "${id}". Expected a UUID.`,
      );
    }
  }

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

    if (brandId) {
      const bid = parseInt(brandId, 10);
      if (!Number.isNaN(bid)) {
        query.andWhere('r.brand_id = :brandId', { brandId: bid });
      }
    }

    if (reportType) {
      query.andWhere('r.report_type = :reportType', { reportType });
    }

    const [reports, total] = await query.getManyAndCount();

    const reportsWithFlags = await Promise.all(
      reports.map(async (report) => {
        const flags = await this.flagsRepo.find({
          where: {
            reportId: report.id as unknown as ReportFlag['reportId'],
            status:   'open',
          },
          order: {
            createdAt: 'DESC',
          },
        });
        return { ...report, flags };
      }),
    );

    return {
      data:  reportsWithFlags,
      total,
      page,
      limit,
    };
  }

  // ── Single Report with all details ───────────────────────────────
  async getReport(id: string) {
    this.assertReportUuid(id);

    const report = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
      relations: ['brand', 'outlet', 'reportedBy'],
    });

    if (!report) {
      throw new NotFoundException(`Report with id "${id}" not found`);
    }

    const flags = await this.flagsRepo.find({
      where:  { reportId: id as unknown as ReportFlag['reportId'] },
      order:  { createdAt: 'DESC' },
    });

    const message = await this.msgRepo.findOne({
      where: { id: report.messageId },
      select: { id: true, bodyRaw: true, aiExtraction: true },
    });

    return {
      parsedReport: report,
      flags,
      message: message
        ? { bodyRaw: message.bodyRaw, aiExtraction: message.aiExtraction }
        : null,
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
