import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { ParsedReport } from '../review/entities/parsed-report.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(ParsedReport)
    private readonly parsedRepo: Repository<ParsedReport>,
    private dataSource: DataSource,
  ) {}

  /** null = all brands (super_admin only, when brand_id query omitted) */
  private resolveBrandId(
    current: JwtUser,
    brandId?: number,
  ): number | null {
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      return current.brandId;
    }
    return brandId ?? null;
  }

  async summary(
    current: JwtUser,
    brandId?: number,
    from?: string,
    to?: string,
  ) {
    const bid = this.resolveBrandId(current, brandId);

    const qb = this.parsedRepo
      .createQueryBuilder('pr')
      .select('pr.report_type', 'reportType')
      .addSelect('pr.status', 'status')
      .addSelect('COUNT(*)', 'count');

    if (bid != null) {
      qb.where('pr.brand_id = :bid', { bid });
    }

    if (from) {
      qb.andWhere('pr.created_at >= :from', { from: new Date(from) });
    }
    if (to) {
      qb.andWhere('pr.created_at <= :to', { to: new Date(to) });
    }

    qb.groupBy('pr.report_type').addGroupBy('pr.status');

    const rows = await qb.getRawMany<{
      reportType: string;
      status: string;
      count: string;
    }>();

    return rows.map((r) => ({
      reportType: r.reportType,
      status: r.status,
      count: parseInt(r.count, 10),
    }));
  }

  async flaggedRate(current: JwtUser, brandId?: number) {
    const bid = this.resolveBrandId(current, brandId);

    const totalQb = this.parsedRepo.createQueryBuilder('pr');
    if (bid != null) {
      totalQb.where('pr.brand_id = :bid', { bid });
    }
    const total = await totalQb.getCount();

    const flaggedQb = this.parsedRepo
      .createQueryBuilder('pr')
      .where('pr.status = :st', { st: 'flagged' });
    if (bid != null) {
      flaggedQb.andWhere('pr.brand_id = :bid', { bid });
    }

    const flagged = await flaggedQb.getCount();

    const rate = total === 0 ? 0 : flagged / total;

    return { flagged, total, rate };
  }

  async reportsByDay(
    current: JwtUser,
    brandId?: number,
    from?: string,
    to?: string,
  ) {
    const bid = this.resolveBrandId(current, brandId);

    const qb = this.parsedRepo.manager
      .createQueryBuilder()
      .select(`DATE(COALESCE(pr.report_date::timestamp, pr.created_at))`, 'day')
      .addSelect('COUNT(*)', 'count')
      .from('parsed_reports', 'pr');

    if (bid != null) {
      qb.where('pr.brand_id = :bid', { bid: bid });
    }

    if (from) {
      qb.andWhere('pr.created_at >= :from', { from: new Date(from) });
    }
    if (to) {
      qb.andWhere('pr.created_at <= :to', { to: new Date(to) });
    }

    qb.groupBy('day').orderBy('day', 'ASC');

    const rows = await qb.getRawMany<{ day: string; count: string }>();

    return rows.map((r) => ({
      day: r.day,
      count: parseInt(r.count, 10),
    }));
  }

  async topFlaggedProducts(
    current: JwtUser,
    brandId?: number,
    limit = 10,
  ) {
    const bid = this.resolveBrandId(current, brandId);
    const lim = Math.min(100, Math.max(1, limit));

    const brandClause = bid != null ? 'AND pr.brand_id = $2' : '';
    const params: unknown[] = bid != null ? [lim, bid] : [lim];

    const rows = await this.parsedRepo.manager.query<
      { product_name_raw: string; cnt: string }[]
    >(
      `
      SELECT mri.product_name_raw AS product_name_raw, COUNT(*)::text AS cnt
      FROM merchandiser_report_items mri
      INNER JOIN merchandiser_reports mr ON mr.id = mri.merchandiser_report_id
      INNER JOIN parsed_reports pr ON pr.id = mr.report_id
      WHERE mri.is_product_matched = false
        AND mri.product_name_raw IS NOT NULL
        AND TRIM(mri.product_name_raw) <> ''
        ${brandClause}
      GROUP BY mri.product_name_raw
      ORDER BY COUNT(*) DESC
      LIMIT $1
    `,
      params,
    );

    return rows.map((r) => ({
      productNameRaw: r.product_name_raw,
      count: parseInt(r.cnt, 10),
    }));
  }

  async getReportsByDay(
    brandId?: string,
    from?:    string,
    to?:      string,
  ) {
    let sql = `
      SELECT
        DATE(report_date) AS day,
        report_type,
        COUNT(*)::int     AS count
      FROM parsed_reports
      WHERE report_date IS NOT NULL
    `;

    const params: any[] = [];

    if (brandId) {
      params.push(brandId);
      sql += ` AND brand_id = $${params.length}`;
    }
    if (from) {
      params.push(from);
      sql += ` AND report_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND report_date <= $${params.length}`;
    }

    sql += ` GROUP BY DATE(report_date), report_type ORDER BY day DESC LIMIT 60`;

    return this.dataSource.query(sql, params);
  }

  async getTopFlaggedProducts(brandId?: string, limit = 10) {
    let sql = `
      SELECT
        mri.product_name_raw,
        COUNT(*)::int AS count
      FROM merchandiser_report_items mri
      JOIN merchandiser_reports mr ON mr.id = mri.merchandiser_report_id
      JOIN parsed_reports pr       ON pr.id = mr.report_id
      WHERE mri.is_product_matched = false
    `;

    const params: any[] = [];

    if (brandId) {
      params.push(brandId);
      sql += ` AND pr.brand_id = $${params.length}`;
    }

    params.push(limit);
    sql += `
      GROUP BY mri.product_name_raw
      ORDER BY count DESC
      LIMIT $${params.length}
    `;

    return this.dataSource.query(sql, params);
  }
}
