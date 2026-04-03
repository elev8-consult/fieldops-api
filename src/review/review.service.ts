import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { WhatsappMessage }  from '../messages/entities/whatsapp-message.entity';
import { ParsedReport }     from './entities/parsed-report.entity';
import { ReportFlag }       from './entities/report-flag.entity';

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

  private parseReportId(param: string): number {
    const id = parseInt(param, 10);
    if (Number.isNaN(id)) {
      throw new NotFoundException(`Report ${param} not found`);
    }
    return id;
  }

  private parseFlagId(param: string): number {
    const id = parseInt(param, 10);
    if (Number.isNaN(id)) {
      throw new NotFoundException(`Flag ${param} not found`);
    }
    return id;
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

    // Step 1: Build base query WITHOUT join or orderBy on joined table
    // Use simple find with where conditions to avoid the databaseName error
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

    // Step 2: Get reports and total count separately
    const [reports, total] = await query.getManyAndCount();

    // Step 3: For each report, fetch its open flags separately
    // This avoids the broken leftJoinAndMapMany that caused the error
    const reportsWithFlags = await Promise.all(
      reports.map(async (report) => {
        const flags = await this.flagsRepo.find({
          where: {
            reportId: report.id,
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
    const numericId = this.parseReportId(id);
    const report = await this.reportsRepo.findOne({
      where: { id: numericId },
      relations: ['brand', 'outlet', 'reportedBy'],
    });

    if (!report) {
      throw new NotFoundException(`Report ${id} not found`);
    }

    // Fetch all flags for this report (all statuses)
    const flags = await this.flagsRepo.find({
      where:  { reportId: numericId },
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
    const numericId = this.parseReportId(id);
    const report = await this.reportsRepo.findOne({ where: { id: numericId } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    // Update report status
    await this.reportsRepo.update(numericId, { status: 'approved' });

    // Resolve all open flags for this report
    const openFlags = await this.flagsRepo.find({
      where: { reportId: numericId, status: 'open' },
    });

    await Promise.all(
      openFlags.map((flag) =>
        this.flagsRepo.update(flag.id, {
          status:     'resolved',
          resolvedById: userId,
          resolvedAt: new Date(),
        }),
      ),
    );

    return this.getReport(id);
  }

  // ── Reject Report ─────────────────────────────────────────────────
  async reject(id: string) {
    const numericId = this.parseReportId(id);
    const report = await this.reportsRepo.findOne({ where: { id: numericId } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    await this.reportsRepo.update(numericId, { status: 'rejected' });

    return this.getReport(id);
  }

  // ── Update Report Fields ──────────────────────────────────────────
  async update(id: string, data: Partial<ParsedReport>) {
    const numericId = this.parseReportId(id);
    const report = await this.reportsRepo.findOne({ where: { id: numericId } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);

    // Remove fields that should not be updated directly
    const { id: _id, createdAt: _c, ...updateData } = data as any;

    await this.reportsRepo.update(numericId, {
      ...updateData,
      status: 'pending_review',
    });

    const updated = await this.reportsRepo.findOne({
      where: { id: numericId },
      relations: ['brand', 'outlet', 'flags', 'reportedBy'],
    });
    if (!updated) {
      throw new NotFoundException(`Report ${id} not found`);
    }
    return updated;
  }

  // ── Resolve Flag ──────────────────────────────────────────────────
  async resolveFlag(flagId: string, userId: number) {
    const id = this.parseFlagId(flagId);
    const flag = await this.flagsRepo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Flag ${flagId} not found`);

    await this.flagsRepo.update(id, {
      status:       'resolved',
      resolvedById: userId,
      resolvedAt:   new Date(),
    });

    return this.flagsRepo.findOne({ where: { id } });
  }

  // ── Dismiss Flag ──────────────────────────────────────────────────
  async dismissFlag(flagId: string, userId: number) {
    const id = this.parseFlagId(flagId);
    const flag = await this.flagsRepo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Flag ${flagId} not found`);

    await this.flagsRepo.update(id, {
      status:       'dismissed',
      resolvedById: userId,
      resolvedAt:   new Date(),
    });

    return this.flagsRepo.findOne({ where: { id } });
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
