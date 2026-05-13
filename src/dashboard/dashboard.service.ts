import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { MerchandiserDashboardQueryDto } from './dto/merchandiser-dashboard-query.dto';

interface MerchandiserDashboardResponse {
  summary: {
    outlets_visited: number;
    total_items_counted: number;
    unmatched_products: number;
    reports_pending_review: number;
    last_report_at: string | null;
  };
  products: {
    id: string;
    canonical_name: string;
    sku: string | null;
    sort_order: number;
  }[];
  rows: {
    outlet_id: string;
    outlet_name: string;
    outlet_type: string;
    region_name: string | null;
    is_depot: boolean;
    last_report_date: string | null;
    has_flags: boolean;
    pending_review: boolean;
    cells: Record<
      string,
      {
        quantity: number | null;
        expiry_date: string | null;
        expiry_raw: string | null;
        report_date: string;
        match_type: string | null;
        match_confidence: number | null;
        has_batches: boolean;
      }
    >;
    row_total: number;
  }[];
  column_totals: Record<string, number>;
  generated_at: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveBrandId(
    current: JwtUser,
    requestedBrandId?: string | null,
  ): string | null {
    if (current.role === 'brand_manager' || current.role === 'supervisor') {
      if (current.brandId == null) {
        throw new ForbiddenException('User has no brand scope');
      }
      if (requestedBrandId != null && String(current.brandId) !== requestedBrandId) {
        throw new ForbiddenException('Out of scoped brand');
      }
      return String(current.brandId);
    }
    return requestedBrandId ?? null;
  }

  private sanitizeSheetName(raw: string) {
    return raw.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  async getMerchandiserDashboard(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<MerchandiserDashboardResponse> {
    const dateFrom = query.date_from ?? this.daysAgo(30);
    const dateTo = query.date_to ?? this.today();

    const brandId = this.resolveBrandId(current, query.brand_id);

    if (brandId != null) {
      const [brand] = await this.dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM brands WHERE id = $1 AND is_active = true LIMIT 1',
        [brandId],
      );
      if (!brand) throw new NotFoundException('Brand not found');
    }

    const products = await this.dataSource.query<
      Array<{
        id: string;
        canonical_name: string;
        sku: string | null;
        sort_order: number | null;
      }>
    >(
      `
      SELECT
        id,
        canonical_name,
        sku,
        COALESCE(sort_order, 999999) AS sort_order
      FROM products
      WHERE flow IN ('merchandiser', 'both')
        AND is_active = true
        ${brandId != null ? 'AND brand_id = $1' : ''}
      ORDER BY COALESCE(sort_order, 999999), canonical_name
      `,
      brandId != null ? [brandId] : [],
    );

    const params: unknown[] = [dateFrom, dateTo];
    let paramIdx = 3;
    const brandClause = brandId != null ? `AND pr.brand_id = $${paramIdx++}` : '';
    const outletClause = query.outlet_id != null ? `AND pr.outlet_id = $${paramIdx++}` : '';
    const reportedByClause =
      query.reported_by != null ? `AND pr.reported_by = $${paramIdx++}` : '';

    if (brandId != null) params.push(brandId);
    if (query.outlet_id != null) params.push(query.outlet_id);
    if (query.reported_by != null) params.push(query.reported_by);

    const pivotRows = await this.dataSource.query<
      Array<{
        outlet_id: string;
        outlet_name: string;
        outlet_type: string;
        is_depot: boolean;
        region_name: string | null;
        product_id: string;
        quantity: number | null;
        expiry_date: string | null;
        expiry_raw: string | null;
        match_type: string | null;
        match_confidence: number | null;
        report_date: string;
        status: string;
        item_id: string;
        has_batches: boolean;
      }>
    >(
      `
      WITH ranked AS (
        SELECT
          pr.outlet_id,
          mri.product_id,
          mri.quantity,
          mri.expiry_date,
          mri.expiry_raw,
          mri.match_type,
          mri.match_confidence,
          pr.report_date,
          pr.status,
          mri.id AS item_id,
          ROW_NUMBER() OVER (
            PARTITION BY pr.outlet_id, mri.product_id
            ORDER BY pr.report_date DESC, pr.created_at DESC
          ) AS rn
        FROM parsed_reports pr
        JOIN merchandiser_reports mr ON mr.report_id = pr.id
        JOIN merchandiser_report_items mri ON mri.merchandiser_report_id = mr.id
        WHERE pr.report_type = 'merchandiser'
          AND pr.report_date BETWEEN $1 AND $2
          AND pr.brand_id IS NOT NULL
          AND pr.outlet_id IS NOT NULL
          AND mri.product_id IS NOT NULL
          ${brandClause}
          ${outletClause}
          ${reportedByClause}
      )
      SELECT
        o.id AS outlet_id,
        o.name AS outlet_name,
        o.type AS outlet_type,
        o.is_depot,
        r.name AS region_name,
        ranked.product_id,
        ranked.quantity,
        ranked.expiry_date,
        ranked.expiry_raw,
        ranked.match_type,
        ranked.match_confidence,
        ranked.report_date,
        ranked.status,
        ranked.item_id,
        EXISTS (
          SELECT 1
          FROM merchandiser_report_item_batches b
          WHERE b.report_item_id = ranked.item_id
        ) AS has_batches
      FROM ranked
      JOIN outlets o ON o.id = ranked.outlet_id
      LEFT JOIN regions r ON r.id = o.region_id
      WHERE ranked.rn = 1
      ORDER BY o.name, ranked.product_id
      `,
      params,
    );

    const flagParams: unknown[] = [dateFrom, dateTo];
    let flagIdx = 3;
    const flagBrandClause = brandId != null ? `AND pr.brand_id = $${flagIdx++}` : '';
    const flagOutletClause =
      query.outlet_id != null ? `AND pr.outlet_id = $${flagIdx++}` : '';
    const flagReportedByClause =
      query.reported_by != null ? `AND pr.reported_by = $${flagIdx++}` : '';
    if (brandId != null) flagParams.push(brandId);
    if (query.outlet_id != null) flagParams.push(query.outlet_id);
    if (query.reported_by != null) flagParams.push(query.reported_by);

    const flagRows = await this.dataSource.query<
      Array<{ outlet_id: string; has_errors: boolean; has_pending: boolean }>
    >(
      `
      SELECT
        pr.outlet_id,
        bool_or(rf.severity = 'error') AS has_errors,
        bool_or(pr.status = 'pending_review') AS has_pending
      FROM parsed_reports pr
      LEFT JOIN report_flags rf ON rf.report_id = pr.id AND rf.status = 'open'
      WHERE pr.report_type = 'merchandiser'
        AND pr.report_date BETWEEN $1 AND $2
        ${flagBrandClause}
        ${flagOutletClause}
        ${flagReportedByClause}
      GROUP BY pr.outlet_id
      `,
      flagParams,
    );

    const flagMap: Record<string, { has_flags: boolean; pending_review: boolean }> = {};
    flagRows.forEach((row) => {
      flagMap[String(row.outlet_id)] = {
        has_flags: row.has_errors === true,
        pending_review: row.has_pending === true,
      };
    });

    const summaryParams: unknown[] = [dateFrom, dateTo];
    let summaryIdx = 3;
    const summaryBrandClause = brandId != null ? `AND pr.brand_id = $${summaryIdx++}` : '';
    const summaryOutletClause =
      query.outlet_id != null ? `AND pr.outlet_id = $${summaryIdx++}` : '';
    const summaryReportedByClause =
      query.reported_by != null ? `AND pr.reported_by = $${summaryIdx++}` : '';
    if (brandId != null) summaryParams.push(brandId);
    if (query.outlet_id != null) summaryParams.push(query.outlet_id);
    if (query.reported_by != null) summaryParams.push(query.reported_by);

    const [summary] = await this.dataSource.query<
      Array<{
        outlets_visited: string;
        total_items_counted: string;
        unmatched_products: string;
        reports_pending_review: string;
        last_report_at: string | null;
      }>
    >(
      `
      SELECT
        COUNT(DISTINCT pr.outlet_id) AS outlets_visited,
        COALESCE(SUM(mri.quantity), 0) AS total_items_counted,
        COUNT(CASE WHEN mri.is_product_matched = false THEN 1 END) AS unmatched_products,
        COUNT(CASE WHEN pr.status = 'pending_review' THEN 1 END) AS reports_pending_review,
        MAX(pr.created_at) AS last_report_at
      FROM parsed_reports pr
      JOIN merchandiser_reports mr ON mr.report_id = pr.id
      JOIN merchandiser_report_items mri ON mri.merchandiser_report_id = mr.id
      WHERE pr.report_type = 'merchandiser'
        AND pr.report_date BETWEEN $1 AND $2
        AND pr.brand_id IS NOT NULL
        AND pr.outlet_id IS NOT NULL
        ${summaryBrandClause}
        ${summaryOutletClause}
        ${summaryReportedByClause}
      `,
      summaryParams,
    );

    const outletMap: Record<
      string,
      MerchandiserDashboardResponse['rows'][number]
    > = {};
    for (const row of pivotRows) {
      const outletKey = String(row.outlet_id);
      if (!outletMap[outletKey]) {
        outletMap[outletKey] = {
          outlet_id: outletKey,
          outlet_name: row.outlet_name,
          outlet_type: row.outlet_type,
          region_name: row.region_name ?? null,
          is_depot: row.is_depot,
          last_report_date: row.report_date,
          has_flags: flagMap[outletKey]?.has_flags ?? false,
          pending_review: flagMap[outletKey]?.pending_review ?? false,
          cells: {},
          row_total: 0,
        };
      }

      outletMap[outletKey].cells[String(row.product_id)] = {
        quantity: row.quantity,
        expiry_date: row.expiry_date,
        expiry_raw: row.expiry_raw,
        report_date: row.report_date,
        match_type: row.match_type,
        match_confidence:
          row.match_confidence != null ? Number(row.match_confidence) : null,
        has_batches: row.has_batches === true,
      };
      outletMap[outletKey].row_total += Number(row.quantity ?? 0);

      if (
        outletMap[outletKey].last_report_date == null ||
        row.report_date > outletMap[outletKey].last_report_date
      ) {
        outletMap[outletKey].last_report_date = row.report_date;
      }
    }

    const columnTotals: Record<string, number> = {};
    Object.values(outletMap).forEach((outlet) => {
      Object.entries(outlet.cells).forEach(([productId, cell]) => {
        columnTotals[productId] = (columnTotals[productId] ?? 0) + (cell.quantity ?? 0);
      });
    });

    return {
      summary: {
        outlets_visited: Number(summary?.outlets_visited ?? 0),
        total_items_counted: Number(summary?.total_items_counted ?? 0),
        unmatched_products: Number(summary?.unmatched_products ?? 0),
        reports_pending_review: Number(summary?.reports_pending_review ?? 0),
        last_report_at: summary?.last_report_at ?? null,
      },
      products: products.map((product) => ({
        id: String(product.id),
        canonical_name: product.canonical_name,
        sku: product.sku,
        sort_order: Number(product.sort_order ?? 999999),
      })),
      rows: Object.values(outletMap),
      column_totals: columnTotals,
      generated_at: new Date().toISOString(),
    };
  }

  async exportToExcel(current: JwtUser, query: MerchandiserDashboardQueryDto) {
    const dashboardData = await this.getMerchandiserDashboard(current, query);

    const workbook = new ExcelJS.Workbook();
    const sheetName = this.sanitizeSheetName(
      `Merchandiser ${query.date_from ?? this.daysAgo(30)} - ${query.date_to ?? this.today()}`,
    );
    const sheet = workbook.addWorksheet(sheetName);

    const headerRow = sheet.addRow([
      'Outlet',
      ...dashboardData.products.map((product) => product.canonical_name),
    ]);
    headerRow.font = { bold: true };

    for (const row of dashboardData.rows) {
      const values = [
        row.outlet_name,
        ...dashboardData.products.map((product) => {
          return row.cells[product.id]?.quantity ?? '';
        }),
      ];
      sheet.addRow(values);
    }

    sheet.getColumn(1).width = 30;
    dashboardData.products.forEach((_, idx) => {
      sheet.getColumn(idx + 2).width = 18;
    });

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }
}
