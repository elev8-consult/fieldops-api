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
        item_id: string | null;
        quantity: number | null;
        expiry_date: string | null;
        expiry_raw: string | null;
        report_date: string;
        match_type: string | null;
        match_confidence: number | null;
        has_batches: boolean;
        batches: Array<{
          id: string;
          quantity: number | null;
          expiry_date: string | null;
          expiry_raw: string | null;
        }>;
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
          -- DENSE_RANK (not ROW_NUMBER) so that when the same product is
          -- listed on several lines of the SAME latest report, every line is
          -- kept and shown as its own expiry lot.
          DENSE_RANK() OVER (
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

    // Per-item batches (a product counted in several expiry lots).
    const visibleItemIds = pivotRows
      .map((r) => r.item_id)
      .filter((id): id is string => id != null);

    const batchMap: Record<
      string,
      Array<{
        id: string;
        quantity: number | null;
        expiry_date: string | null;
        expiry_raw: string | null;
      }>
    > = {};

    if (visibleItemIds.length > 0) {
      const batchRows = await this.dataSource.query<
        Array<{
          id: string;
          report_item_id: string;
          quantity: number | null;
          expiry_date: string | null;
          expiry_raw: string | null;
        }>
      >(
        `SELECT
           b.id::text             AS id,
           b.report_item_id::text AS report_item_id,
           b.quantity             AS quantity,
           b.expiry_date          AS expiry_date,
           b.expiry_raw           AS expiry_raw
         FROM merchandiser_report_item_batches b
         WHERE b.report_item_id = ANY($1::uuid[])
         ORDER BY b.expiry_date ASC NULLS LAST, b.id`,
        [visibleItemIds],
      );

      for (const b of batchRows) {
        (batchMap[b.report_item_id] ??= []).push({
          id: b.id,
          quantity: b.quantity != null ? Number(b.quantity) : null,
          expiry_date: b.expiry_date,
          expiry_raw: b.expiry_raw,
        });
      }
    }

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

      const productKey = String(row.product_id);

      // Each line becomes one or more "lots": either its explicit batch rows,
      // or the line itself when it has none.
      const rowBatches = row.item_id != null ? (batchMap[row.item_id] ?? []) : [];
      const rowLots =
        rowBatches.length > 0
          ? rowBatches
          : [
              {
                id: String(row.item_id ?? `${productKey}-${row.outlet_id}`),
                quantity: row.quantity != null ? Number(row.quantity) : null,
                expiry_date: row.expiry_date,
                expiry_raw: row.expiry_raw,
              },
            ];

      const existing = outletMap[outletKey].cells[productKey];

      if (!existing) {
        outletMap[outletKey].cells[productKey] = {
          item_id: row.item_id ?? null,
          quantity: row.quantity != null ? Number(row.quantity) : null,
          expiry_date: row.expiry_date,
          expiry_raw: row.expiry_raw,
          report_date: row.report_date,
          match_type: row.match_type,
          match_confidence:
            row.match_confidence != null ? Number(row.match_confidence) : null,
          has_batches: rowBatches.length > 0,
          batches: rowLots,
        };
      } else {
        // Same product counted again on this report — merge the lots and sum.
        existing.batches.push(...rowLots);
        existing.quantity =
          (existing.quantity ?? 0) + (row.quantity != null ? Number(row.quantity) : 0);
        existing.has_batches = true;
        // Surface the soonest expiry at the cell level.
        if (
          row.expiry_date != null &&
          (existing.expiry_date == null || row.expiry_date < existing.expiry_date)
        ) {
          existing.expiry_date = row.expiry_date;
        }
      }

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

    // ── Header row ──────────────────────────────────────────────────────────
    const headerRow = sheet.addRow([
      'Outlet',
      ...dashboardData.products.map((p) => p.canonical_name),
    ]);
    headerRow.font = { bold: true };
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    });
    headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    // ── Data rows ────────────────────────────────────────────────────────────
    for (const row of dashboardData.rows) {
      const excelRow = sheet.addRow([
        row.outlet_name,
        ...dashboardData.products.map((product) => {
          const cell = row.cells[product.id];
          if (!cell) return '';
          const qty = cell.quantity ?? '';
          const expiry = cell.expiry_date
            ? this.fmtExcelDate(cell.expiry_date)
            : (cell.expiry_raw ?? '');
          // show em-dash when stock is present but expiry is not recorded
          if (cell.quantity !== null && cell.quantity > 0) {
            return expiry ? `${qty}\n${expiry}` : `${qty}\n—`;
          }
          return String(qty);
        }),
      ]);

      excelRow.height = 32;
      excelRow.getCell(1).alignment = { vertical: 'middle' };

      dashboardData.products.forEach((product, idx) => {
        const cell = row.cells[product.id];
        const excelCell = excelRow.getCell(idx + 2);
        excelCell.alignment = {
          wrapText: true,
          horizontal: 'center',
          vertical: 'middle',
        };
        const fill = this.expiryFill(cell);
        if (fill) excelCell.fill = fill;
      });
    }

    // ── Column widths ────────────────────────────────────────────────────────
    sheet.getColumn(1).width = 30;
    dashboardData.products.forEach((_, idx) => {
      sheet.getColumn(idx + 2).width = 18;
    });

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }

  private fmtExcelDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(2);
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }

  private expiryFill(
    cell: { quantity: number | null; expiry_date: string | null; expiry_raw?: string | null } | undefined,
  ): { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } } | null {
    if (!cell || cell.quantity === null || cell.quantity === 0) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }; // red-50: no stock
    }
    if (!cell.expiry_date && !cell.expiry_raw) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // slate-200: missing expiry
    }
    if (cell.expiry_date) {
      const days = Math.floor(
        (new Date(cell.expiry_date).getTime() - Date.now()) / 86_400_000,
      );
      if (days < 0) {
        return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // red-100: expired
      }
      if (days <= 30) {
        return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } }; // yellow-50: expiring soon
      }
    }
    return null; // white: OK
  }
}
