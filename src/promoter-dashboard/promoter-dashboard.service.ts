import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import {
  promoterDashboardAllowedStatuses,
  type PromoterDashboardQueryDto,
} from './dto/promoter-dashboard-query.dto';

type ProductColumn = {
  id: string;
  canonical_name: string;
  is_offer: boolean;
};

type DashboardRow = {
  outlet_id: string;
  outlet_name: string;
  outlet_type: string;
  has_flags: boolean;
  flag_messages: string[];
  pending_review: boolean;
  cells: Record<string, Record<string, number>>;
  palette: Record<string, number>;
  gifts: Record<string, number>;
  row_total: number;
};

@Injectable()
export class PromoterDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const to = dateTo ? new Date(dateTo) : new Date();
    const from = dateFrom
      ? new Date(dateFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  private resolveStatusList(status?: string[]) {
    if (status != null && status.length > 0) {
      return status;
    }
    return ['approved', 'reviewed', 'pending_review'];
  }

  private async resolveBrandId(current: JwtUser, requestedBrandId?: string) {
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand scope');
      }
      if (requestedBrandId != null && requestedBrandId !== String(current.brandId)) {
        throw new ForbiddenException('Out of brand scope');
      }
      return String(current.brandId);
    }

    if (requestedBrandId == null) {
      throw new ForbiddenException('brand_id is required');
    }

    return requestedBrandId;
  }

  private buildReportFilters(
    brandId: string,
    query: PromoterDashboardQueryDto,
    outletIdOverride?: string,
  ) {
    const dateRange = this.resolveDateRange(query.date_from, query.date_to);
    const statuses = this.resolveStatusList(query.status);
    const outletId = outletIdOverride ?? query.outlet_id ?? null;
    const reportedBy = query.reported_by ?? null;
    return { brandId, dateRange, statuses, outletId, reportedBy };
  }

  private async getProductColumns(
    brandId: string,
    statuses: string[],
    dateFrom: string,
    dateTo: string,
    outletId: string | null,
    reportedBy: string | null,
  ) {
    const productRows = await this.dataSource.query<
      Array<{ id: string | number; canonical_name: string }>
    >(
      `
      SELECT p.id, p.canonical_name
      FROM products p
      WHERE p.brand_id = $1
        AND p.is_active = true
        AND p.flow IN ('promoter', 'both')
      ORDER BY p.canonical_name ASC
      `,
      [brandId],
    );

    const offerRows = await this.dataSource.query<
      Array<{ offer_name: string }>
    >(
      `
      SELECT DISTINCT
        COALESCE(NULLIF(TRIM(psi.promo_label), ''), NULLIF(TRIM(psi.product_name_raw), ''), 'Offer') AS offer_name
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
        AND psi.is_offer = true
      ORDER BY offer_name
      `,
      [brandId, dateFrom, dateTo, statuses, outletId, reportedBy],
    );

    const baseColumns: ProductColumn[] = productRows.map((row, index) => ({
      id: String(row.id),
      canonical_name: row.canonical_name,
      is_offer: false,
    }));

    const offerColumns: ProductColumn[] = offerRows.map((row) => ({
      id: `offer:${row.offer_name}`,
      canonical_name: row.offer_name,
      is_offer: true,
    }));

    return [...baseColumns, ...offerColumns];
  }

  async getSummary(current: JwtUser, query: PromoterDashboardQueryDto) {
    const brandId = await this.resolveBrandId(current, query.brand_id);
    const filters = this.buildReportFilters(brandId, query);

    const [row] = await this.dataSource.query<
      Array<{
        outlets_visited: string;
        units_sold: string;
        samples_given: string;
        persons_contacted: string;
        persons_tasted: string;
      }>
    >(
      `
      WITH filtered_reports AS (
        SELECT pr.id
        FROM parsed_reports pr
        WHERE pr.report_type = 'promoter'
          AND pr.brand_id = $1
          AND pr.report_date BETWEEN $2 AND $3
          AND pr.status = ANY($4::text[])
          AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
          AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      )
      SELECT
        COUNT(DISTINCT pr.outlet_id)::text AS outlets_visited,
        COALESCE(SUM(psi.quantity), 0)::text AS units_sold,
        COALESCE(SUM(psam.quantity), 0)::text AS samples_given,
        COALESCE(SUM(pmr.persons_contacted), 0)::text AS persons_contacted,
        COALESCE(SUM(pmr.persons_tasted), 0)::text AS persons_tasted
      FROM filtered_reports fr
      INNER JOIN parsed_reports pr ON pr.id = fr.id
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      LEFT JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      LEFT JOIN promoter_sample_items psam ON psam.promoter_report_id = pmr.id
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
      ],
    );

    return {
      outlets_visited: parseInt(row?.outlets_visited ?? '0', 10),
      units_sold: parseInt(row?.units_sold ?? '0', 10),
      samples_given: parseInt(row?.samples_given ?? '0', 10),
      persons_contacted: parseInt(row?.persons_contacted ?? '0', 10),
      persons_tasted: parseInt(row?.persons_tasted ?? '0', 10),
    };
  }

  async getFilters(current: JwtUser, query: PromoterDashboardQueryDto) {
    const brandId = await this.resolveBrandId(current, query.brand_id);
    const filters = this.buildReportFilters(brandId, query);

    const outlets = await this.dataSource.query<
      Array<{ id: string; name: string }>
    >(
      `
      SELECT DISTINCT o.id::text AS id, o.name
      FROM parsed_reports pr
      INNER JOIN outlets o ON o.id = pr.outlet_id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
      ORDER BY o.name
      `,
      [filters.brandId, filters.dateRange.from, filters.dateRange.to],
    );

    const promoters = await this.dataSource.query<
      Array<{ id: string; full_name: string }>
    >(
      `
      SELECT DISTINCT u.id::text AS id, u.full_name
      FROM parsed_reports pr
      INNER JOIN users u ON u.id = pr.reported_by
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND u.role = 'promoter'
      ORDER BY u.full_name
      `,
      [filters.brandId, filters.dateRange.from, filters.dateRange.to],
    );

    return {
      statuses: promoterDashboardAllowedStatuses,
      outlets,
      promoters,
    };
  }

  async getGrid(current: JwtUser, query: PromoterDashboardQueryDto) {
    const brandId = await this.resolveBrandId(current, query.brand_id);
    const filters = this.buildReportFilters(brandId, query);
    const productColumns = await this.getProductColumns(
      brandId,
      filters.statuses,
      filters.dateRange.from,
      filters.dateRange.to,
      filters.outletId,
      filters.reportedBy,
    );
    const nonOfferIds = productColumns
      .filter((column) => !column.is_offer)
      .map((column) => column.id);

    const outletRows = await this.dataSource.query<
      Array<{
        outlet_id: string;
        outlet_name: string;
        outlet_type: string;
        has_flags: boolean;
        pending_review: boolean;
        flag_messages: string[] | null;
      }>
    >(
      `
      SELECT
        o.id::text AS outlet_id,
        o.name AS outlet_name,
        o.type AS outlet_type,
        EXISTS (
          SELECT 1
          FROM parsed_reports prf
          INNER JOIN report_flags rf ON rf.report_id = prf.id
          WHERE prf.report_type = 'promoter'
            AND prf.brand_id = $1
            AND prf.report_date BETWEEN $2 AND $3
            AND prf.status = ANY($4::text[])
            AND ($5::uuid IS NULL OR prf.outlet_id = $5::uuid)
            AND ($6::uuid IS NULL OR prf.reported_by = $6::uuid)
            AND prf.outlet_id = o.id
            AND rf.status = 'open'
            AND rf.severity = 'error'
        ) AS has_flags,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT rf.message), NULL) AS flag_messages,
        BOOL_OR(pr.status = 'pending_review') AS pending_review
      FROM parsed_reports pr
      INNER JOIN outlets o ON o.id = pr.outlet_id
      LEFT JOIN report_flags rf
        ON rf.report_id = pr.id
       AND rf.status = 'open'
       AND rf.severity = 'error'
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      GROUP BY o.id, o.name, o.type
      ORDER BY o.name
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
      ],
    );

    const dateRows = await this.dataSource.query<Array<{ report_date: string }>>(
      `
      SELECT DISTINCT pr.report_date::text AS report_date
      FROM parsed_reports pr
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      ORDER BY pr.report_date
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
      ],
    );

    const saleRows = await this.dataSource.query<
      Array<{
        outlet_id: string;
        report_date: string;
        product_key: string;
        qty: string;
      }>
    >(
      `
      WITH palette_product_ids AS (
        SELECT DISTINCT pa.product_id
        FROM product_aliases pa
        WHERE pa.alias ILIKE '%palette%'
      )
      SELECT
        pr.outlet_id::text AS outlet_id,
        pr.report_date::text AS report_date,
        CASE
          WHEN psi.is_offer = true
            THEN 'offer:' || COALESCE(NULLIF(TRIM(psi.promo_label), ''), NULLIF(TRIM(psi.product_name_raw), ''), 'Offer')
          ELSE psi.product_id::text
        END AS product_key,
        SUM(COALESCE(psi.quantity, 0))::text AS qty
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      LEFT JOIN palette_product_ids ppid ON ppid.product_id = psi.product_id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
        AND (
          psi.is_offer = true
          OR (
            psi.is_offer = false
            AND psi.product_id::text = ANY($7::text[])
            AND ppid.product_id IS NULL
            AND COALESCE(psi.product_name_raw, '') NOT ILIKE '%palette%'
          )
        )
      GROUP BY pr.outlet_id, pr.report_date, product_key
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
        nonOfferIds.length > 0 ? nonOfferIds : [''],
      ],
    );

    const paletteRows = await this.dataSource.query<
      Array<{ outlet_id: string; report_date: string; qty: string }>
    >(
      `
      WITH palette_product_ids AS (
        SELECT DISTINCT pa.product_id
        FROM product_aliases pa
        WHERE pa.alias ILIKE '%palette%'
      )
      SELECT
        pr.outlet_id::text AS outlet_id,
        pr.report_date::text AS report_date,
        SUM(COALESCE(psi.quantity, 0))::text AS qty
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      LEFT JOIN palette_product_ids ppid ON ppid.product_id = psi.product_id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
        AND (
          COALESCE(psi.product_name_raw, '') ILIKE '%palette%'
          OR ppid.product_id IS NOT NULL
        )
      GROUP BY pr.outlet_id, pr.report_date
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
      ],
    );

    const giftRows = await this.dataSource.query<
      Array<{ outlet_id: string; report_date: string; qty: string }>
    >(
      `
      SELECT
        pr.outlet_id::text AS outlet_id,
        pr.report_date::text AS report_date,
        SUM(COALESCE(psam.quantity, 0))::text AS qty
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sample_items psam ON psam.promoter_report_id = pmr.id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4::text[])
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      GROUP BY pr.outlet_id, pr.report_date
      `,
      [
        filters.brandId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
        filters.outletId,
        filters.reportedBy,
      ],
    );

    const dates = dateRows.map((row) => row.report_date);
    const rows: DashboardRow[] = outletRows.map((row) => ({
      outlet_id: row.outlet_id,
      outlet_name: row.outlet_name,
      outlet_type: row.outlet_type,
      has_flags: row.has_flags,
      flag_messages: row.flag_messages ?? [],
      pending_review: row.pending_review,
      cells: {},
      palette: {},
      gifts: {},
      row_total: 0,
    }));

    const rowByOutlet = new Map(rows.map((row) => [row.outlet_id, row]));
    const columnTotals: Record<string, number> = {};
    for (const product of productColumns) {
      columnTotals[product.id] = 0;
    }
    let paletteTotal = 0;
    let giftsTotal = 0;
    let grandTotal = 0;

    for (const sale of saleRows) {
      const outlet = rowByOutlet.get(sale.outlet_id);
      if (!outlet) continue;
      const qty = parseInt(sale.qty ?? '0', 10) || 0;
      if (qty === 0) continue;

      outlet.cells[sale.report_date] ??= {};
      outlet.cells[sale.report_date][sale.product_key] =
        (outlet.cells[sale.report_date][sale.product_key] ?? 0) + qty;
      outlet.row_total += qty;
      columnTotals[sale.product_key] = (columnTotals[sale.product_key] ?? 0) + qty;
      grandTotal += qty;
    }

    for (const palette of paletteRows) {
      const outlet = rowByOutlet.get(palette.outlet_id);
      if (!outlet) continue;
      const qty = parseInt(palette.qty ?? '0', 10) || 0;
      if (qty === 0) continue;
      outlet.palette[palette.report_date] =
        (outlet.palette[palette.report_date] ?? 0) + qty;
      outlet.row_total += qty;
      paletteTotal += qty;
      grandTotal += qty;
    }

    for (const gift of giftRows) {
      const outlet = rowByOutlet.get(gift.outlet_id);
      if (!outlet) continue;
      const qty = parseInt(gift.qty ?? '0', 10) || 0;
      if (qty === 0) continue;
      outlet.gifts[gift.report_date] = (outlet.gifts[gift.report_date] ?? 0) + qty;
      outlet.row_total += qty;
      giftsTotal += qty;
      grandTotal += qty;
    }

    return {
      dates,
      products: productColumns.map((product) => ({
        id: product.id,
        canonical_name: product.canonical_name,
        is_offer: product.is_offer,
      })),
      rows,
      column_totals: {
        ...columnTotals,
        palette: paletteTotal,
        gifts: giftsTotal,
        grand_total: grandTotal,
      },
    };
  }

  async getOutletReports(
    current: JwtUser,
    outletId: string,
    query: PromoterDashboardQueryDto,
  ) {
    const brandId = await this.resolveBrandId(current, query.brand_id);
    const filters = this.buildReportFilters(brandId, query, outletId);

    const [outlet] = await this.dataSource.query<
      Array<{
        id: string | number;
        name: string;
        type: string;
        region_name: string | null;
      }>
    >(
      `
      SELECT
        o.id,
        o.name,
        o.type,
        r.name AS region_name
      FROM outlets o
      LEFT JOIN regions r ON r.id = o.region_id
      WHERE o.id = $1::uuid
      `,
      [outletId],
    );

    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    const reportRows = await this.dataSource.query<
      Array<{
        report_id: string;
        report_date: string;
        status: string;
        promoter_id: string | null;
        promoter_name: string | null;
        persons_contacted: number | null;
        persons_tasted: number | null;
        feedback_text: string | null;
        most_asked_question: string | null;
      }>
    >(
      `
      SELECT
        pr.id::text AS report_id,
        pr.report_date::text AS report_date,
        pr.status,
        u.id::text AS promoter_id,
        u.full_name AS promoter_name,
        pmr.persons_contacted,
        pmr.persons_tasted,
        pmr.feedback_text,
        pmr.most_asked_question
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      LEFT JOIN users u ON u.id = pr.reported_by
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.outlet_id = $2::uuid
        AND pr.report_date BETWEEN $3 AND $4
        AND pr.status = ANY($5::text[])
      ORDER BY pr.report_date DESC, pr.created_at DESC
      `,
      [
        filters.brandId,
        outletId,
        filters.dateRange.from,
        filters.dateRange.to,
        filters.statuses,
      ],
    );

    if (reportRows.length === 0) {
      return {
        outlet: {
          id: String(outlet.id),
          name: outlet.name,
          type: outlet.type,
          region: outlet.region_name,
        },
        reports: [],
      };
    }

    const reportIds = reportRows.map((row) => row.report_id);
    const salesRows = await this.dataSource.query<
      Array<{
        report_id: string;
        id: string;
        product_name: string | null;
        quantity: number | null;
        is_offer: boolean;
        promo_label: string | null;
      }>
    >(
      `
      SELECT
        pr.id::text AS report_id,
        psi.id::text AS id,
        COALESCE(p.canonical_name, psi.product_name_raw) AS product_name,
        psi.quantity,
        psi.is_offer,
        psi.promo_label
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      LEFT JOIN products p ON p.id = psi.product_id
      WHERE pr.id::text = ANY($1::text[])
      ORDER BY pr.report_date DESC, psi.created_at ASC
      `,
      [reportIds],
    );

    const sampleRows = await this.dataSource.query<
      Array<{
        report_id: string;
        id: string;
        product_name: string | null;
        quantity: number | null;
      }>
    >(
      `
      SELECT
        pr.id::text AS report_id,
        psam.id::text AS id,
        COALESCE(p.canonical_name, psam.product_name_raw) AS product_name,
        psam.quantity
      FROM parsed_reports pr
      INNER JOIN promoter_reports pmr ON pmr.report_id = pr.id
      INNER JOIN promoter_sample_items psam ON psam.promoter_report_id = pmr.id
      LEFT JOIN products p ON p.id = psam.product_id
      WHERE pr.id::text = ANY($1::text[])
      ORDER BY pr.report_date DESC, psam.created_at ASC
      `,
      [reportIds],
    );

    const flagRows = await this.dataSource.query<
      Array<{
        report_id: string;
        id: string;
        severity: string;
        status: string;
        message: string;
      }>
    >(
      `
      SELECT
        rf.report_id::text AS report_id,
        rf.id::text AS id,
        rf.severity,
        rf.status,
        rf.message
      FROM report_flags rf
      WHERE rf.report_id::text = ANY($1::text[])
        AND rf.status = 'open'
      ORDER BY rf.created_at ASC
      `,
      [reportIds],
    );

    const salesByReport = new Map<string, typeof salesRows>();
    for (const row of salesRows) {
      const list = salesByReport.get(row.report_id) ?? [];
      list.push(row);
      salesByReport.set(row.report_id, list);
    }

    const samplesByReport = new Map<string, typeof sampleRows>();
    for (const row of sampleRows) {
      const list = samplesByReport.get(row.report_id) ?? [];
      list.push(row);
      samplesByReport.set(row.report_id, list);
    }

    const flagsByReport = new Map<string, typeof flagRows>();
    for (const row of flagRows) {
      const list = flagsByReport.get(row.report_id) ?? [];
      list.push(row);
      flagsByReport.set(row.report_id, list);
    }

    return {
      outlet: {
        id: String(outlet.id),
        name: outlet.name,
        type: outlet.type,
        region: outlet.region_name,
      },
      reports: reportRows.map((report) => ({
        report_id: report.report_id,
        report_date: report.report_date,
        status: report.status,
        promoter: {
          id: report.promoter_id,
          full_name: report.promoter_name,
        },
        persons_contacted: report.persons_contacted ?? 0,
        persons_tasted: report.persons_tasted ?? 0,
        feedback_text: report.feedback_text,
        most_asked_question: report.most_asked_question,
        sales: (salesByReport.get(report.report_id) ?? []).map((sale) => ({
          id: sale.id,
          product_name: sale.product_name,
          quantity: sale.quantity ?? 0,
          is_offer: sale.is_offer,
          promo_label: sale.promo_label,
        })),
        samples: (samplesByReport.get(report.report_id) ?? []).map((sample) => ({
          id: sample.id,
          product_name: sample.product_name,
          quantity: sample.quantity ?? 0,
        })),
        flags: (flagsByReport.get(report.report_id) ?? []).map((flag) => ({
          id: flag.id,
          severity: flag.severity,
          status: flag.status,
          message: flag.message,
        })),
      })),
    };
  }
}

