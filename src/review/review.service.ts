import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { WhatsappMessage } from '../messages/entities/whatsapp-message.entity';
import { UpdateParsedReportDto } from './dto/update-parsed-report.dto';
import { ParsedReport } from './entities/parsed-report.entity';
import { ReportFlag } from './entities/report-flag.entity';

export interface ReviewQueueQuery {
  brandId?: number;
  reportType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ParsedReport)
    private readonly parsedRepo: Repository<ParsedReport>,
    @InjectRepository(ReportFlag)
    private readonly flagRepo: Repository<ReportFlag>,
    @InjectRepository(WhatsappMessage)
    private readonly msgRepo: Repository<WhatsappMessage>,
    private readonly auditService: AuditService,
  ) {}

  private assertBrand(current: JwtUser, brandId: number) {
    if (current.role === 'brand_manager') {
      if (current.brandId == null || current.brandId !== brandId) {
        throw new ForbiddenException('Out of brand scope');
      }
    }
  }

  async queue(current: JwtUser, q: ReviewQueueQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const status = q.status ?? 'flagged';

    const qb = this.parsedRepo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.brand', 'brand')
      .leftJoinAndSelect('pr.outlet', 'outlet')
      .leftJoinAndSelect('pr.flags', 'flag', 'flag.status = :open', {
        open: 'open',
      })
      .where('pr.status = :st', { st: status })
      .orderBy('pr.created_at', 'DESC');

    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      qb.andWhere('pr.brand_id = :bid', { bid: current.brandId });
    } else if (q.brandId != null) {
      qb.andWhere('pr.brand_id = :bid', { bid: q.brandId });
    }

    if (q.reportType) {
      qb.andWhere('pr.report_type = :rt', { rt: q.reportType });
    }

    const total = await qb.clone().getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOne(id: number, current: JwtUser) {
    const pr = await this.parsedRepo.findOne({
      where: { id },
      relations: ['brand', 'outlet', 'flags', 'reportedBy'],
    });
    if (!pr) {
      throw new NotFoundException('Report not found');
    }
    this.assertBrand(current, pr.brandId);

    const message = await this.msgRepo.findOne({
      where: { id: pr.messageId },
      select: { id: true, bodyRaw: true, aiExtraction: true },
    });

    return {
      parsedReport: pr,
      flags: pr.flags,
      message: message
        ? { bodyRaw: message.bodyRaw, aiExtraction: message.aiExtraction }
        : null,
    };
  }

  private assertCanMutateReview(current: JwtUser) {
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer' &&
      current.role !== 'supervisor'
    ) {
      throw new ForbiddenException();
    }
  }

  async updateParsed(
    id: number,
    dto: UpdateParsedReportDto,
    current: JwtUser,
  ): Promise<ParsedReport> {
    const pr = await this.parsedRepo.findOne({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Report not found');
    }
    this.assertBrand(current, pr.brandId);
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer'
    ) {
      throw new ForbiddenException();
    }

    if (dto.outletId !== undefined) {
      const old = pr.outletId;
      pr.outletId = dto.outletId;
      await this.auditService.log(
        current.id,
        'parsed_report',
        pr.id,
        'update',
        'outletId',
        old != null ? String(old) : null,
        dto.outletId != null ? String(dto.outletId) : null,
      );
    }
    if (dto.reportDate !== undefined) {
      const old = pr.reportDate;
      pr.reportDate = dto.reportDate;
      await this.auditService.log(
        current.id,
        'parsed_report',
        pr.id,
        'update',
        'reportDate',
        old != null ? String(old) : null,
        dto.reportDate != null ? String(dto.reportDate) : null,
      );
    }
    if (dto.locationRaw !== undefined) {
      const old = pr.locationRaw;
      pr.locationRaw = dto.locationRaw;
      await this.auditService.log(
        current.id,
        'parsed_report',
        pr.id,
        'update',
        'locationRaw',
        old != null ? String(old) : null,
        dto.locationRaw != null ? String(dto.locationRaw) : null,
      );
    }
    if (dto.nameRaw !== undefined) {
      const old = pr.nameRaw;
      pr.nameRaw = dto.nameRaw;
      await this.auditService.log(
        current.id,
        'parsed_report',
        pr.id,
        'update',
        'nameRaw',
        old != null ? String(old) : null,
        dto.nameRaw != null ? String(dto.nameRaw) : null,
      );
    }

    const previousStatus = pr.status;
    pr.status = 'pending_review';
    const saved = await this.parsedRepo.save(pr);

    await this.auditService.log(
      current.id,
      'parsed_report',
      pr.id,
      'status_change',
      'status',
      previousStatus,
      'pending_review',
    );

    return saved;
  }

  async approve(id: number, current: JwtUser): Promise<ParsedReport> {
    const pr = await this.parsedRepo.findOne({
      where: { id },
      relations: ['flags'],
    });
    if (!pr) {
      throw new NotFoundException('Report not found');
    }
    this.assertBrand(current, pr.brandId);
    this.assertCanMutateReview(current);

    const oldStatus = pr.status;
    pr.status = 'approved';
    await this.parsedRepo.save(pr);

    await this.flagRepo.update(
      { reportId: pr.id, status: 'open' },
      {
        status: 'resolved',
        resolvedById: current.id,
        resolvedAt: new Date(),
      },
    );

    await this.auditService.log(
      current.id,
      'parsed_report',
      pr.id,
      'approve',
      'status',
      oldStatus,
      'approved',
    );

    return pr;
  }

  async reject(id: number, current: JwtUser): Promise<ParsedReport> {
    const pr = await this.parsedRepo.findOne({ where: { id } });
    if (!pr) {
      throw new NotFoundException('Report not found');
    }
    this.assertBrand(current, pr.brandId);
    this.assertCanMutateReview(current);

    const oldStatus = pr.status;
    pr.status = 'rejected';
    await this.parsedRepo.save(pr);

    await this.auditService.log(
      current.id,
      'parsed_report',
      pr.id,
      'reject',
      'status',
      oldStatus,
      'rejected',
    );

    return pr;
  }

  async resolveFlag(flagId: number, current: JwtUser): Promise<ReportFlag> {
    const flag = await this.flagRepo.findOne({
      where: { id: flagId },
      relations: ['report'],
    });
    if (!flag) {
      throw new NotFoundException('Flag not found');
    }
    this.assertBrand(current, flag.report.brandId);
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer' &&
      current.role !== 'supervisor'
    ) {
      throw new ForbiddenException();
    }

    flag.status = 'resolved';
    flag.resolvedById = current.id;
    flag.resolvedAt = new Date();
    return this.flagRepo.save(flag);
  }

  async dismissFlag(flagId: number, current: JwtUser): Promise<ReportFlag> {
    const flag = await this.flagRepo.findOne({
      where: { id: flagId },
      relations: ['report'],
    });
    if (!flag) {
      throw new NotFoundException('Flag not found');
    }
    this.assertBrand(current, flag.report.brandId);
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer' &&
      current.role !== 'supervisor'
    ) {
      throw new ForbiddenException();
    }

    flag.status = 'dismissed';
    flag.resolvedById = current.id;
    flag.resolvedAt = new Date();
    return this.flagRepo.save(flag);
  }
}
