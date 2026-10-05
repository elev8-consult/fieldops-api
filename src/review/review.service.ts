import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ParsedReport } from './entities/parsed-report.entity';
import { ReportFlag } from './entities/report-flag.entity';
import { ProductsService } from '../products/products.service';
import { assertBrandAccess, scopedBrandFilter } from '../common/brand-scope';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { AcceptMatchDto } from './dto/accept-match.dto';
import type { UpdateParsedReportDto } from './dto/update-parsed-report.dto';

type Row = Record<string, unknown>;

type ReviewItem = {
  productNameRaw?: unknown;
  isProductMatched?: unknown;
  matchSuggestions?: unknown[];
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(ParsedReport)
    private reportsRepo: Repository<ParsedReport>,

    @InjectRepository(ReportFlag)
    private flagsRepo: Repository<ReportFlag>,
    private dataSource: DataSource,
    private productsService: ProductsService,
  ) {}

  // ── Review Queue ──────────────────────────────────────────────────
  async getQueue(
    current: JwtUser,
    filters: {
      brandId?: string;
      reportType?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { reportType, status = 'flagged', page = 1, limit = 20 } = filters;
    const brandId = scopedBrandFilter(current, filters.brandId);

    const query = this.reportsRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status })
      .orderBy('r.created_at', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (brandId) query.andWhere('r.brand_id = :brandId', { brandId });
    if (reportType)
      query.andWhere('r.report_type = :reportType', { reportType });

    const [reports, total] = await query.getManyAndCount();

    const flags = reports.length
      ? await this.flagsRepo.find({
          where: { reportId: In(reports.map((r) => r.id)), status: 'open' },
          order: { createdAt: 'DESC' },
        })
      : [];
    const flagsByReport = new Map<string, ReportFlag[]>();
    for (const flag of flags) {
      const list = flagsByReport.get(flag.reportId) ?? [];
      list.push(flag);
      flagsByReport.set(flag.reportId, list);
    }

    const reportsWithFlags = reports.map((report) => ({
      ...report,
      flags: flagsByReport.get(report.id) ?? [],
    }));

    return { data: reportsWithFlags, total, page, limit };
  }

  private async findReportInScope(
    id: string,
    current: JwtUser,
  ): Promise<ParsedReport> {
    const report = await this.reportsRepo.findOne({
      where: { id: id as unknown as ParsedReport['id'] },
    });
    if (!report) throw new NotFoundException(`Report ${id} not found`);
    assertBrandAccess(current, report.brandId);
    return report;
  }

  // ── Single Report with all details ───────────────────────────────
  async getReport(id: string, current: JwtUser) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new BadRequestException(`Invalid report ID format: "${id}"`);
    }

    const report = await this.findReportInScope(id, current);

    const flags = await this.flagsRepo.find({
      where: { reportId: id as unknown as ReportFlag['reportId'] },
      order: { createdAt: 'DESC' },
    });

    const messageRows: Row[] = await this.dataSource.query(
      `SELECT id, body_raw, body_normalized, ai_extraction, ai_classification,
              ai_confidence, message_type, sender_phone, sender_name, received_at
       FROM whatsapp_messages WHERE id = $1`,
      [report.messageId],
    );

    const brandRows: Row[] = report.brandId
      ? await this.dataSource.query(
          `SELECT id, name, slug FROM brands WHERE id = $1`,
          [report.brandId],
        )
      : [];

    const outletRows: Row[] = report.outletId
      ? await this.dataSource.query(
          `SELECT id, name, type, is_depot FROM outlets WHERE id = $1`,
          [report.outletId],
        )
      : [];

    let reportData: Row | null = null;

    if (report.reportType === 'merchandiser') {
      const rows: Row[] = await this.dataSource.query(
        `SELECT
           mr.id,
           mr.promo_type AS "promoType",
           mr.notes,
           COALESCE(
             json_agg(json_build_object(
               'id',               mri.id,
               'productNameRaw',   mri.product_name_raw,
               'productId',        mri.product_id,
               'quantity',         mri.quantity,
               'expiryDate',       mri.expiry_date,
               'expiryRaw',        mri.expiry_raw,
               'isProductMatched', mri.is_product_matched,
               'matchConfidence',  mri.match_confidence,
               'matchType',        mri.match_type
             ) ORDER BY mri.created_at)
             FILTER (WHERE mri.id IS NOT NULL),
             '[]'
           ) AS "items"
         FROM merchandiser_reports mr
         LEFT JOIN merchandiser_report_items mri
           ON mri.merchandiser_report_id = mr.id
         WHERE mr.report_id = $1
         GROUP BY mr.id`,
        [id],
      );
      reportData = rows[0] ?? null;

      if (reportData && report.brandId != null) {
        await this.addMatchSuggestions(reportData.items, report.brandId);
      }
    }

    if (report.reportType === 'promoter') {
      const rows: Row[] = await this.dataSource.query(
        `SELECT
           pr.id,
           pr.promo_stand_placement AS "promoStandPlacement",
           pr.persons_contacted AS "personsContacted",
           pr.persons_tasted AS "personsTasted",
           pr.feedback_text AS "feedbackText",
           pr.most_asked_question AS "mostAskedQuestion",
           pr.questions_answers AS "questionsAnswers",
           COALESCE(
             (SELECT json_agg(json_build_object(
               'id',               s.id,
               'productNameRaw',   s.product_name_raw,
               'productId',        s.product_id,
               'quantity',         s.quantity,
               'promoLabel',       s.promo_label,
               'isOffer',          s.is_offer,
               'isProductMatched', s.is_product_matched,
               'matchConfidence',  s.match_confidence,
               'matchType',        s.match_type
             ) ORDER BY s.created_at)
             FROM promoter_sale_items s WHERE s.promoter_report_id = pr.id),
             '[]'
           ) AS "sales",
           COALESCE(
             (SELECT json_agg(json_build_object(
               'id',               si.id,
               'productNameRaw',   si.product_name_raw,
               'productId',        si.product_id,
               'quantity',         si.quantity,
               'availabilityNote', si.availability_note,
               'isProductMatched', si.is_product_matched,
               'matchConfidence',  si.match_confidence,
               'matchType',        si.match_type
             ) ORDER BY si.created_at)
             FROM promoter_sample_items si WHERE si.promoter_report_id = pr.id),
             '[]'
           ) AS "samples"
         FROM promoter_reports pr
         WHERE pr.report_id = $1`,
        [id],
      );
      reportData = rows[0] ?? null;

      if (reportData && report.brandId != null) {
        await this.addMatchSuggestions(reportData.sales, report.brandId);
        await this.addMatchSuggestions(reportData.samples, report.brandId);
      }
    }

    return {
      ...report,
      flags,
      message: messageRows[0] ?? null,
      brand: brandRows[0] ?? null,
      outlet: outletRows[0] ?? null,
      reportData,
    };
  }

  private async addMatchSuggestions(list: unknown, brandId: string | number) {
    if (!Array.isArray(list)) return;
    for (const item of list as ReviewItem[]) {
      const rawName =
        typeof item.productNameRaw === 'string' ? item.productNameRaw : '';
      if (!item.isProductMatched && rawName.trim().length > 0) {
        const match = await this.productsService.fuzzyMatchProduct(
          String(brandId),
          rawName,
        );
        item.matchSuggestions = match.suggestions.slice(0, 3);
      } else {
        item.matchSuggestions = [];
      }
    }
  }

  // ── Approve Report ────────────────────────────────────────────────
  async approve(id: string, current: JwtUser) {
    await this.findReportInScope(id, current);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(ParsedReport, { id }, { status: 'approved' });
      await manager.update(
        ReportFlag,
        { reportId: id, status: 'open' },
        {
          status: 'resolved',
          resolvedById: current.id,
          resolvedAt: new Date(),
        },
      );
    });

    return this.getReport(id, current);
  }

  // ── Reject Report ─────────────────────────────────────────────────
  async reject(id: string, current: JwtUser) {
    await this.findReportInScope(id, current);

    await this.reportsRepo.update({ id }, { status: 'rejected' });

    return this.getReport(id, current);
  }

  // ── Update Report Fields ──────────────────────────────────────────
  async update(id: string, dto: UpdateParsedReportDto, current: JwtUser) {
    await this.findReportInScope(id, current);

    if (dto.brandId !== undefined && current.role !== 'super_admin') {
      throw new ForbiddenException('Only super admins can change the brand');
    }

    const updateData: Partial<
      Pick<
        ParsedReport,
        | 'brandId'
        | 'isDepotReport'
        | 'outletId'
        | 'reportDate'
        | 'locationRaw'
        | 'nameRaw'
      >
    > = {};
    if (dto.brandId !== undefined) updateData.brandId = dto.brandId;
    if (dto.isDepotReport !== undefined)
      updateData.isDepotReport = dto.isDepotReport;
    if (dto.outletId !== undefined) updateData.outletId = dto.outletId;
    if (dto.reportDate !== undefined) updateData.reportDate = dto.reportDate;
    if (dto.locationRaw !== undefined) updateData.locationRaw = dto.locationRaw;
    if (dto.nameRaw !== undefined) updateData.nameRaw = dto.nameRaw;

    await this.reportsRepo.update(
      { id },
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
  async resolveFlag(flagId: string, current: JwtUser) {
    return this.closeFlag(flagId, 'resolved', current);
  }

  // ── Dismiss Flag ──────────────────────────────────────────────────
  async dismissFlag(flagId: string, current: JwtUser) {
    return this.closeFlag(flagId, 'dismissed', current);
  }

  private async closeFlag(
    flagId: string,
    status: 'resolved' | 'dismissed',
    current: JwtUser,
  ) {
    const flag = await this.flagsRepo.findOne({
      where: { id: flagId },
      relations: ['report'],
    });
    if (!flag) throw new NotFoundException(`Flag ${flagId} not found`);
    assertBrandAccess(current, flag.report?.brandId);

    await this.flagsRepo.update(
      { id: flagId },
      {
        status,
        resolvedById: current.id,
        resolvedAt: new Date(),
      },
    );

    return this.flagsRepo.findOne({ where: { id: flagId } });
  }

  async acceptProductMatch(
    itemId: string,
    dto: AcceptMatchDto,
    current: JwtUser,
  ): Promise<{ success: boolean; aliasCreated: boolean }> {
    const { productId, rawName, reportType } = dto;

    const tableName =
      reportType === 'merchandiser'
        ? 'merchandiser_report_items'
        : reportType === 'promoter_sale'
          ? 'promoter_sale_items'
          : 'promoter_sample_items';

    const parentJoin =
      reportType === 'merchandiser'
        ? 'ri.merchandiser_report_id = mr.id'
        : 'ri.promoter_report_id = pr_r.id';

    const parentTables =
      reportType === 'merchandiser'
        ? 'merchandiser_reports mr JOIN parsed_reports pr ON pr.id = mr.report_id'
        : 'promoter_reports pr_r JOIN parsed_reports pr ON pr.id = pr_r.report_id';

    const itemRows: Array<{ brand_id: string | null }> =
      await this.dataSource.query(
        `SELECT pr.brand_id
         FROM ${tableName} ri
         JOIN ${parentTables} ON ${parentJoin}
         WHERE ri.id::text = $1`,
        [itemId],
      );
    if (!itemRows.length) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }
    const reportBrandId = itemRows[0].brand_id;
    assertBrandAccess(current, reportBrandId);

    const productRows: Array<{ brand_id: string }> =
      await this.dataSource.query(
        `SELECT brand_id FROM products WHERE id = $1`,
        [productId],
      );
    if (!productRows.length) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
    if (reportBrandId != null && productRows[0].brand_id !== reportBrandId) {
      throw new BadRequestException(
        'Product belongs to a different brand than the report',
      );
    }

    const userId = String(current.id);
    const normalizedRaw = rawName.trim().toLowerCase();

    const aliasCreated = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE ${tableName}
         SET product_id = $1,
             is_product_matched = true,
             match_type = 'fuzzy_confirmed',
             match_confidence = 1.0
         WHERE id::text = $2`,
        [productId, itemId],
      );

      let created = false;
      const existing: Row[] = await manager.query(
        `SELECT id FROM product_aliases WHERE lower(alias) = lower($1) LIMIT 1`,
        [normalizedRaw],
      );
      if (existing.length === 0) {
        await manager.query(
          `INSERT INTO product_aliases (product_id, alias, created_by, created_at)
           VALUES ($1, $2, $3, now())`,
          [productId, normalizedRaw, userId],
        );
        created = true;
      }

      await manager.query(
        `UPDATE report_flags rf
         SET status = 'resolved',
             resolved_by = $1,
             resolved_at = now()
         FROM ${tableName} ri
         JOIN ${parentTables}
           ON ${parentJoin}
         WHERE ri.id::text = $2
           AND rf.report_id = pr.id
           AND rf.flag_code = 'UNRECOGNIZED_PRODUCT'
           AND rf.status = 'open'
           AND rf.message ILIKE $3`,
        [userId, itemId, `%${escapeLike(rawName)}%`],
      );

      return created;
    });

    return { success: true, aliasCreated };
  }

  // ── Get Queue Count (for sidebar badge) ──────────────────────────
  async getQueueCount(
    current: JwtUser,
    requestedBrandId?: string,
  ): Promise<number> {
    const brandId = scopedBrandFilter(current, requestedBrandId);
    const query = this.reportsRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'flagged' });

    if (brandId) {
      query.andWhere('r.brand_id = :brandId', { brandId });
    }

    return query.getCount();
  }
}
