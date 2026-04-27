import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import ExcelJS from 'exceljs';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { MerchandiserDashboardQueryDto } from './dto/merchandiser-dashboard-query.dto';

type DashboardStatus = 'approved' | 'flagged';

interface DashboardBatch {
  quantity: number | null;
  expiryDate: string | null;
  expiryRaw: string | null;
}

interface DashboardCell {
  quantity: number | null;
  reportDate: string;
  reportId: string;
  expiryDate: string | null;
  expiryRaw: string | null;
  hasMultipleBatches: boolean;
  batches: DashboardBatch[];
  status: DashboardStatus;
}

interface DashboardRow {
  outletId: string;
  outletName: string;
  isDepot: boolean;
  cells: Record<string, DashboardCell>;
}

interface MerchandiserDashboardResponse {
  brand: { id: string; name: string; slug: string };
  dateRange: { from: string; to: string };
  products: Array<{ id: string; name: string }>;
  outlets: Array<{ id: string; name: string; isDepot: boolean }>;
  rows: DashboardRow[];
  summary: {
    totalReports: number;
    totalOutlets: number;
    totalProducts: number;
    approvedCount: number;
    flaggedCount: number;
    lastReportDate: string | null;
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveBrandId(current: JwtUser, requestedBrandId: number): number {
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      if (current.brandId !== requestedBrandId) {
        throw new ForbiddenException('Out of brand scope');
      }
      return current.brandId;
    }
    return requestedBrandId;
  }

  private getStatusList(status: MerchandiserDashboardQueryDto['status']) {
    if (status === 'all') return ['approved', 'flagged'] as DashboardStatus[];
    if (status === 'flagged') return ['flagged'] as DashboardStatus[];
    return ['approved'] as DashboardStatus[];
  }

  private toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const to = dateTo ? new Date(dateTo) : new Date();
    const from = dateFrom
      ? new Date(dateFrom)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: this.toIsoDate(from),
      to: this.toIsoDate(to),
    };
  }

  private isExpiringWithin30Days(expiryDate: string) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 30;
  }

  private sanitizeSheetName(raw: string) {
    return raw.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  }

  async getMerchandiserDashboard(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<MerchandiserDashboardResponse> {
    const brandId = this.resolveBrandId(current, query.brandId);
    const statusList = this.getStatusList(query.status);
    const dateRange = this.resolveDateRange(query.dateFrom, query.dateTo);

    const [brand] = await this.dataSource.query<
      Array<{ id: number; name: string; slug: string }>
    >('SELECT id, name, slug FROM brands WHERE id = $1', [brandId]);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const products = await this.dataSource.query<
      Array<{ id: number; name: string }>
    >(
      `
      SELECT p.id, p.canonical_name AS name
      FROM products p
      WHERE p.brand_id = $1
        AND p.is_active = true
        AND p.flow IN ('merchandiser', 'both')
      ORDER BY p.canonical_name ASC
      `,
      [brandId],
    );

    const itemRows = await this.dataSource.query<
      Array<{
        outlet_id: number;
        outlet_name: string;
        is_depot: boolean;
        product_id: number;
        quantity: number | null;
        expiry_date: string | null;
        expiry_raw: string | null;
        report_date: string;
        report_id: number;
        status: DashboardStatus;
        report_item_id: number;
      }>
    >(
      `
      WITH latest_reports AS (
        SELECT DISTINCT ON (pr.outlet_id)
          pr.id AS report_id,
          pr.outlet_id,
          pr.report_date,
          pr.status,
          mr.id AS merch_report_id
        FROM parsed_reports pr
        INNER JOIN merchandiser_reports mr ON mr.report_id = pr.id
        WHERE pr.brand_id = $1
          AND pr.report_type = 'merchandiser'
          AND pr.report_date BETWEEN $2 AND $3
          AND pr.status = ANY($4)
        ORDER BY pr.outlet_id, pr.report_date DESC, pr.id DESC
      )
      SELECT
        lr.outlet_id,
        o.name AS outlet_name,
        o.is_depot,
        mri.product_id,
        mri.quantity,
        mri.expiry_date,
        mri.expiry_raw,
        lr.report_date,
        lr.report_id,
        lr.status,
        mri.id AS report_item_id
      FROM latest_reports lr
      INNER JOIN outlets o ON o.id = lr.outlet_id
      INNER JOIN merchandiser_report_items mri
        ON mri.merchandiser_report_id = lr.merch_report_id
      WHERE mri.is_product_matched = true
        AND mri.product_id IS NOT NULL
      ORDER BY o.name ASC, mri.product_id ASC
      `,
      [brandId, dateRange.from, dateRange.to, statusList],
    );

    const reportItemIds = itemRows.map((row) => row.report_item_id);
    let batchRows: Array<{
      report_item_id: number;
      quantity: number | null;
      expiry_date: string | null;
      expiry_raw: string | null;
    }> = [];

    if (reportItemIds.length > 0) {
      try {
        batchRows = await this.dataSource.query<
          Array<{
            report_item_id: number;
            quantity: number | null;
            expiry_date: string | null;
            expiry_raw: string | null;
          }>
        >(
          `
          SELECT
            report_item_id,
            quantity,
            expiry_date,
            expiry_raw
          FROM merchandiser_report_item_batches
          WHERE report_item_id = ANY($1::int[])
          ORDER BY report_item_id, expiry_date NULLS LAST, created_at ASC
          `,
          [reportItemIds],
        );
      } catch {
        batchRows = [];
      }
    }

    const batchesByItemId = new Map<number, DashboardBatch[]>();
    for (const batch of batchRows) {
      const currentBatches = batchesByItemId.get(batch.report_item_id) ?? [];
      currentBatches.push({
        quantity: batch.quantity,
        expiryDate: batch.expiry_date,
        expiryRaw: batch.expiry_raw,
      });
      batchesByItemId.set(batch.report_item_id, currentBatches);
    }

    const rowsByOutletId = new Map<number, DashboardRow>();
    for (const row of itemRows) {
      const existing = rowsByOutletId.get(row.outlet_id) ?? {
        outletId: String(row.outlet_id),
        outletName: row.outlet_name,
        isDepot: row.is_depot,
        cells: {},
      };

      const batches = batchesByItemId.get(row.report_item_id) ?? [];
      const fallbackBatch =
        batches.length > 0
          ? batches
          : [
              {
                quantity: row.quantity,
                expiryDate: row.expiry_date,
                expiryRaw: row.expiry_raw,
              },
            ];

      existing.cells[String(row.product_id)] = {
        quantity: row.quantity,
        reportDate: row.report_date,
        reportId: String(row.report_id),
        expiryDate: row.expiry_date,
        expiryRaw: row.expiry_raw,
        hasMultipleBatches: fallbackBatch.length > 1,
        batches: fallbackBatch,
        status: row.status,
      };
      rowsByOutletId.set(row.outlet_id, existing);
    }

    const rows = Array.from(rowsByOutletId.values()).sort((a, b) =>
      a.outletName.localeCompare(b.outletName),
    );
    const outlets = rows.map((row) => ({
      id: row.outletId,
      name: row.outletName,
      isDepot: row.isDepot,
    }));

    const [selectedTotals] = await this.dataSource.query<
      Array<{ total_reports: string }>
    >(
      `
      SELECT COUNT(*)::text AS total_reports
      FROM parsed_reports pr
      WHERE pr.brand_id = $1
        AND pr.report_type = 'merchandiser'
        AND pr.report_date BETWEEN $2 AND $3
        AND pr.status = ANY($4)
      `,
      [brandId, dateRange.from, dateRange.to, statusList],
    );

    const [allStatusSummary] = await this.dataSource.query<
      Array<{
        approved_count: string;
        flagged_count: string;
        last_report_date: string | null;
      }>
    >(
      `
      SELECT
        COUNT(*) FILTER (WHERE pr.status = 'approved')::text AS approved_count,
        COUNT(*) FILTER (WHERE pr.status = 'flagged')::text AS flagged_count,
        MAX(pr.report_date)::text AS last_report_date
      FROM parsed_reports pr
      WHERE pr.brand_id = $1
        AND pr.report_type = 'merchandiser'
        AND pr.report_date BETWEEN $2 AND $3
      `,
      [brandId, dateRange.from, dateRange.to],
    );

    return {
      brand: {
        id: String(brand.id),
        name: brand.name,
        slug: brand.slug,
      },
      dateRange,
      products: products.map((product) => ({
        id: String(product.id),
        name: product.name,
      })),
      outlets,
      rows,
      summary: {
        totalReports: parseInt(selectedTotals?.total_reports ?? '0', 10),
        totalOutlets: outlets.length,
        totalProducts: products.length,
        approvedCount: parseInt(allStatusSummary?.approved_count ?? '0', 10),
        flaggedCount: parseInt(allStatusSummary?.flagged_count ?? '0', 10),
        lastReportDate: allStatusSummary?.last_report_date ?? null,
      },
    };
  }

  async exportToExcel(current: JwtUser, query: MerchandiserDashboardQueryDto) {
    const dashboardData = await this.getMerchandiserDashboard(current, query);

    const workbook = new ExcelJS.Workbook();
    const sheetName = this.sanitizeSheetName(
      `${dashboardData.brand.name} ${dashboardData.dateRange.from} - ${dashboardData.dateRange.to}`,
    );
    const sheet = workbook.addWorksheet(sheetName);

    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    const headerRow = sheet.addRow([
      'Outlet',
      ...dashboardData.products.map((product) => product.name),
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' },
    };

    for (const row of dashboardData.rows) {
      const values = [
        row.outletName,
        ...dashboardData.products.map((product) => {
          const cell = row.cells[product.id];
          return cell?.quantity ?? '';
        }),
      ];

      const excelRow = sheet.addRow(values);
      if (row.isDepot) {
        excelRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
      }

      dashboardData.products.forEach((product, idx) => {
        const reportCell = row.cells[product.id];
        const excelCell = excelRow.getCell(idx + 2);

        if (!reportCell || reportCell.quantity == null || reportCell.quantity === 0) {
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' },
          };
          return;
        }

        if (reportCell.expiryDate && this.isExpiringWithin30Days(reportCell.expiryDate)) {
          excelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' },
          };
          return;
        }

        excelCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' },
        };
      });
    }

    sheet.getColumn(1).width = 30;
    dashboardData.products.forEach((_, idx) => {
      sheet.getColumn(idx + 2).width = 18;
    });

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }
}
