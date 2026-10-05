import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import {
  MobileItemDto,
  SubmitMobileReportDto,
} from './dto/submit-mobile-report.dto';

export interface MobileSummary {
  date: string;
  assignedCount: number;
  visitedCount: number;
  itemsToday: number;
  outlets: Array<{
    id: string;
    name: string;
    regionName: string | null;
    visitedToday: boolean;
  }>;
  lastVisit: {
    outletName: string | null;
    itemCount: number;
    submittedAt: string;
  } | null;
}

/** Reports are dated in Lebanon time, not UTC. */
const BEIRUT_TODAY_SQL = `(now() AT TIME ZONE 'Asia/Beirut')::date`;

function beirutToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

@Injectable()
export class MobileService {
  private readonly logger = new Logger(MobileService.name);
  private hasSubmissionIdColumn: boolean | null = null;

  constructor(private readonly dataSource: DataSource) {}

  /** The duplicate-submission key is ignored until migration 005 has run. */
  private async submissionIdSupported(): Promise<boolean> {
    if (this.hasSubmissionIdColumn == null) {
      const rows = await this.dataSource.query<Array<{ ok: number }>>(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_name = 'parsed_reports' AND column_name = 'client_submission_id'`,
      );
      this.hasSubmissionIdColumn = rows.length > 0;
      if (!this.hasSubmissionIdColumn) {
        this.logger.warn(
          'parsed_reports.client_submission_id missing; run migration 005',
        );
      }
    }
    return this.hasSubmissionIdColumn;
  }

  private async findExistingSubmission(
    userId: string,
    clientSubmissionId: string,
  ): Promise<{
    reportId: string;
    reportIds: string[];
    itemCount: number;
  } | null> {
    const rows = await this.dataSource.query<
      Array<{ id: string; item_count: number }>
    >(
      `SELECT pr.id::text AS id, COUNT(mri.id)::int AS item_count
       FROM parsed_reports pr
       LEFT JOIN merchandiser_reports mr ON mr.report_id = pr.id
       LEFT JOIN merchandiser_report_items mri ON mri.merchandiser_report_id = mr.id
       WHERE pr.reported_by = $1 AND pr.client_submission_id = $2
       GROUP BY pr.id
       ORDER BY pr.id`,
      [userId, clientSubmissionId],
    );
    if (!rows.length) return null;
    return {
      reportId: rows[0].id,
      reportIds: rows.map((r) => r.id),
      itemCount: rows.reduce((n, r) => n + r.item_count, 0),
    };
  }

  /**
   * Everything the mobile home screen needs: the user's assigned outlets with
   * a "visited today" flag, today's totals, and their last submission.
   */
  async summary(current: JwtUser): Promise<MobileSummary> {
    const outlets = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        region_name: string | null;
        visited_today: boolean;
      }>
    >(
      `SELECT
         o.id::text            AS id,
         o.name                AS name,
         r.name                AS region_name,
         EXISTS (
           SELECT 1 FROM parsed_reports pr
           WHERE pr.reported_by = $1
             AND pr.outlet_id   = o.id
             AND pr.report_date = ${BEIRUT_TODAY_SQL}
         )                     AS visited_today
       FROM user_outlets uo
       JOIN outlets o   ON o.id = uo.outlet_id AND o.is_active = true
       LEFT JOIN regions r ON r.id = o.region_id
       WHERE uo.user_id = $1
       ORDER BY o.name`,
      [current.id],
    );

    const [totals] = await this.dataSource.query<
      Array<{ items_today: string | null }>
    >(
      `SELECT COALESCE(SUM(mri.quantity), 0) AS items_today
       FROM parsed_reports pr
       JOIN merchandiser_reports mr       ON mr.report_id = pr.id
       JOIN merchandiser_report_items mri ON mri.merchandiser_report_id = mr.id
       WHERE pr.reported_by = $1
         AND pr.report_date = ${BEIRUT_TODAY_SQL}`,
      [current.id],
    );

    const [last] = await this.dataSource.query<
      Array<{
        outlet_name: string | null;
        item_count: string;
        submitted_at: string;
      }>
    >(
      `SELECT
         o.name                AS outlet_name,
         COUNT(mri.id)         AS item_count,
         pr.created_at         AS submitted_at
       FROM parsed_reports pr
       LEFT JOIN outlets o                ON o.id = pr.outlet_id
       LEFT JOIN merchandiser_reports mr  ON mr.report_id = pr.id
       LEFT JOIN merchandiser_report_items mri
              ON mri.merchandiser_report_id = mr.id
       WHERE pr.reported_by = $1
       GROUP BY pr.id, o.name, pr.created_at
       ORDER BY pr.created_at DESC
       LIMIT 1`,
      [current.id],
    );

    const mapped = outlets.map((o) => ({
      id: o.id,
      name: o.name,
      regionName: o.region_name,
      visitedToday: o.visited_today === true,
    }));

    return {
      date: beirutToday(),
      assignedCount: mapped.length,
      visitedCount: mapped.filter((o) => o.visitedToday).length,
      itemsToday: Number(totals?.items_today ?? 0),
      outlets: mapped,
      lastVisit: last
        ? {
            outletName: last.outlet_name,
            itemCount: Number(last.item_count),
            submittedAt: new Date(last.submitted_at).toISOString(),
          }
        : null,
    };
  }

  /**
   * Submit a store visit from the mobile app. Items are grouped by their
   * product's brand (parsed_reports has one brand per report). Matched items
   * carry their product_id; manually-entered (unknown-barcode) items are
   * attached to the visit's resolved brand.
   */
  async submit(
    current: JwtUser,
    dto: SubmitMobileReportDto,
  ): Promise<{ reportId: string; reportIds: string[]; itemCount: number }> {
    const submissionKey =
      dto.clientSubmissionId && (await this.submissionIdSupported())
        ? dto.clientSubmissionId
        : null;
    if (submissionKey) {
      const existing = await this.findExistingSubmission(
        current.id,
        submissionKey,
      );
      if (existing) return existing;
    }

    const outletRows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM outlets WHERE id = $1`,
      [dto.outletId],
    );
    if (!outletRows.length) {
      throw new BadRequestException(
        'Unknown store. Pull down to refresh your store list.',
      );
    }

    // Resolve each matched item's brand.
    const productIds = dto.items
      .map((i) => i.productId)
      .filter((id): id is string => !!id);

    const brandByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const rows = await this.dataSource.query<
        Array<{ id: string; brand_id: string }>
      >(
        `SELECT id::text AS id, brand_id::text AS brand_id
         FROM products WHERE id = ANY($1::uuid[])`,
        [productIds],
      );
      for (const r of rows) brandByProduct.set(r.id, r.brand_id);
    }

    const matched: { brandId: string; item: MobileItemDto }[] = [];
    const unmatched: MobileItemDto[] = [];
    for (const item of dto.items) {
      const brandId = item.productId
        ? brandByProduct.get(item.productId)
        : undefined;
      if (brandId) matched.push({ brandId, item });
      else unmatched.push(item);
    }

    // Determine which brand manual / unknown items belong to.
    const distinctBrands = [...new Set(matched.map((m) => m.brandId))];
    const fallbackBrand =
      current.brandId ??
      (distinctBrands.length === 1 ? distinctBrands[0] : null);

    if (unmatched.length > 0 && !fallbackBrand) {
      throw new BadRequestException(
        'Cannot determine the brand for manually-entered items. Scan catalog products, or assign this user to a brand.',
      );
    }

    // Build brand -> items groups.
    const groups = new Map<string, MobileItemDto[]>();
    for (const { brandId, item } of matched) {
      (groups.get(brandId) ?? groups.set(brandId, []).get(brandId)!).push(item);
    }
    if (unmatched.length > 0 && fallbackBrand) {
      const arr =
        groups.get(fallbackBrand) ??
        groups.set(fallbackBrand, []).get(fallbackBrand)!;
      arr.push(...unmatched);
    }

    if (groups.size === 0) {
      throw new BadRequestException('No items to submit.');
    }

    const reportDate = beirutToday();
    const reportIds: string[] = [];
    let itemCount = 0;

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const [brandId, items] of groups) {
          const parsed = await manager.query<Array<{ id: string }>>(
            `INSERT INTO parsed_reports
             (message_id, brand_id, outlet_id, reported_by, report_date,
              report_type, status, confidence, is_depot_report, source
              ${submissionKey ? ', client_submission_id' : ''})
           VALUES (NULL, $1, $2, $3, $4,
              'merchandiser'::report_type, 'approved'::parsed_report_status,
              1, false, 'mobile_app'
              ${submissionKey ? ', $5' : ''})
           RETURNING id::text AS id`,
            submissionKey
              ? [brandId, dto.outletId, current.id, reportDate, submissionKey]
              : [brandId, dto.outletId, current.id, reportDate],
          );
          const reportId = parsed[0].id;
          reportIds.push(reportId);

          const merch = await manager.query<Array<{ id: string }>>(
            `INSERT INTO merchandiser_reports (report_id, promo_type, notes)
           VALUES ($1, NULL, NULL)
           RETURNING id::text AS id`,
            [reportId],
          );
          const merchId = merch[0].id;

          for (const item of items) {
            await manager.query(
              `INSERT INTO merchandiser_report_items
               (merchandiser_report_id, product_id, product_name_raw,
                quantity, expiry_date, expiry_raw, is_product_matched)
             VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
              [
                merchId,
                item.productId ?? null,
                item.productNameRaw,
                item.quantity,
                item.expiryDate ?? null,
                !!item.productId,
              ],
            );
            itemCount += 1;
          }
        }
      });
    } catch (err) {
      // A parallel retry of the same submission won the unique index race.
      if (submissionKey && (err as { code?: string })?.code === '23505') {
        const existing = await this.findExistingSubmission(
          current.id,
          submissionKey,
        );
        if (existing) return existing;
      }
      throw err;
    }

    return { reportId: reportIds[0], reportIds, itemCount };
  }
}
