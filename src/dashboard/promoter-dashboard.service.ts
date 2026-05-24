import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { MerchandiserDashboardQueryDto } from './dto/merchandiser-dashboard-query.dto';

interface PromoterProductMeta {
  key: string;
  label: string;
  product_id: string | null;
  unmatched: boolean;
  is_offer: boolean;
  is_gift: boolean;
}

interface PromoterCell {
  quantity: number;
  status: string;
  parsed_report_id: string;
}

interface PromoterRow {
  outlet_id: string;
  outlet_name: string;
  days: Record<string, Record<string, PromoterCell | number>>;
}

interface PromoterDashboardResponse {
  brand: { id: string; name: string };
  date_range: { from: string | null; to: string | null };
  dates: string[];
  products: PromoterProductMeta[];
  rows: PromoterRow[];
  totals: Record<string, Record<string, number>>;
  feedback: Array<{
    outlet_name: string;
    outlet_id: string;
    date: string;
    reporter_name: string | null;
    text: string;
  }>;
}

type SalesRawRow = {
  parsed_report_id: string;
  report_date: string;
  status: string;
  outlet_name: string;
  outlet_id: string;
  product_name_raw: string | null;
  product_id: string | null;
  quantity: string | number | null;
  is_offer: boolean;
  promo_label: string | null;
  is_product_matched: boolean;
  match_confidence: number | null;
  match_type: string | null;
  reporter_name: string | null;
  feedback_text: string | null;
};

type SampleRawRow = {
  parsed_report_id: string;
  report_date: string;
  status: string;
  outlet_name: string;
  outlet_id: string;
  product_name_raw: string | null;
  product_id: string | null;
  quantity: string | number | null;
  is_product_matched: boolean;
  match_confidence: number | null;
  match_type: string | null;
  reporter_name: string | null;
  feedback_text: string | null;
};

@Injectable()
export class PromoterDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveBrandId(current: JwtUser, requestedBrandId: string): string {
    if (current.role === 'brand_manager' || current.role === 'supervisor') {
      if (current.brandId == null) {
        throw new ForbiddenException('User has no brand scope');
      }
      if (String(current.brandId) !== requestedBrandId) {
        throw new ForbiddenException('Out of scoped brand');
      }
      return String(current.brandId);
    }
    return requestedBrandId;
  }

  private sanitizeSheetName(raw: string): string {
    return raw.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  }

  private productSortRank(p: PromoterProductMeta): number {
    if (!p.is_offer && !p.is_gift) return 0;
    if (p.is_offer) return 1;
    return 2;
  }

  private productColor(p: PromoterProductMeta): string | null {
    if (p.unmatched) return 'FFE4CC';
    if (p.is_offer) return 'FFFACD';
    if (p.is_gift) return 'E6F3FF';
    return null;
  }

  async getPromoterDashboard(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<PromoterDashboardResponse> {
    if (!query.brand_id) throw new BadRequestException('brand_id is required');
    const brandId = this.resolveBrandId(current, query.brand_id);
    const dateFrom = query.date_from ?? null;
    const dateTo = query.date_to ?? null;

    const brands = await this.dataSource.query<Array<{ id: string; name: string }>>(
      `SELECT id::text AS id, name
       FROM brands
       WHERE id = $1
       LIMIT 1`,
      [brandId],
    );
    if (!brands[0]) throw new NotFoundException('Brand not found');

    const salesRows = await this.dataSource.query<SalesRawRow[]>(
      `SELECT
         pr.id::text               AS parsed_report_id,
         pr.report_date::text      AS report_date,
         pr.status                 AS status,
         o.name                    AS outlet_name,
         o.id::text                AS outlet_id,
         psi.product_name_raw      AS product_name_raw,
         psi.product_id::text      AS product_id,
         psi.quantity              AS quantity,
         psi.is_offer              AS is_offer,
         psi.promo_label           AS promo_label,
         psi.is_product_matched    AS is_product_matched,
         psi.match_confidence      AS match_confidence,
         psi.match_type            AS match_type,
         pr.name_raw               AS reporter_name,
         prom.feedback_text        AS feedback_text
       FROM parsed_reports pr
       JOIN promoter_reports prom ON prom.report_id = pr.id
       JOIN promoter_sale_items psi ON psi.promoter_report_id = prom.id
       JOIN outlets o ON o.id = pr.outlet_id
       WHERE pr.brand_id = $1
         AND pr.report_type = 'promoter'
         AND ($2::date IS NULL OR pr.report_date >= $2::date)
         AND ($3::date IS NULL OR pr.report_date <= $3::date)`,
      [brandId, dateFrom, dateTo],
    );

    const sampleRows = await this.dataSource.query<SampleRawRow[]>(
      `SELECT
         pr.id::text               AS parsed_report_id,
         pr.report_date::text      AS report_date,
         pr.status                 AS status,
         o.name                    AS outlet_name,
         o.id::text                AS outlet_id,
         psam.product_name_raw     AS product_name_raw,
         psam.product_id::text     AS product_id,
         psam.quantity             AS quantity,
         psam.is_product_matched   AS is_product_matched,
         psam.match_confidence     AS match_confidence,
         psam.match_type           AS match_type,
         pr.name_raw               AS reporter_name,
         prom.feedback_text        AS feedback_text
       FROM parsed_reports pr
       JOIN promoter_reports prom ON prom.report_id = pr.id
       JOIN promoter_sample_items psam ON psam.promoter_report_id = prom.id
       JOIN outlets o ON o.id = pr.outlet_id
       WHERE pr.brand_id = $1
         AND pr.report_type = 'promoter'
         AND ($2::date IS NULL OR pr.report_date >= $2::date)
         AND ($3::date IS NULL OR pr.report_date <= $3::date)`,
      [brandId, dateFrom, dateTo],
    );

    const feedbackRows = await this.dataSource.query<
      Array<{
        outlet_name: string;
        outlet_id: string;
        date: string;
        reporter_name: string | null;
        text: string;
      }>
    >(
      `SELECT DISTINCT
         o.name               AS outlet_name,
         o.id::text           AS outlet_id,
         pr.report_date::text AS date,
         pr.name_raw          AS reporter_name,
         prom.feedback_text   AS text
       FROM parsed_reports pr
       JOIN promoter_reports prom ON prom.report_id = pr.id
       JOIN outlets o ON o.id = pr.outlet_id
       WHERE pr.brand_id = $1
         AND pr.report_type = 'promoter'
         AND ($2::date IS NULL OR pr.report_date >= $2::date)
         AND ($3::date IS NULL OR pr.report_date <= $3::date)
         AND prom.feedback_text IS NOT NULL
         AND btrim(prom.feedback_text) <> ''
       ORDER BY date, outlet_name`,
      [brandId, dateFrom, dateTo],
    );

    const dates = Array.from(
      new Set([...salesRows, ...sampleRows].map((r) => r.report_date)),
    ).sort((a, b) => a.localeCompare(b));

    const rowsMap = new Map<string, PromoterRow>();
    const productsMap = new Map<string, PromoterProductMeta>();

    const ensureRow = (outletId: string, outletName: string): PromoterRow => {
      if (rowsMap.has(outletId)) return rowsMap.get(outletId)!;
      const days: Record<string, Record<string, PromoterCell | number>> = {};
      for (const d of dates) days[d] = { total: 0 };
      const row: PromoterRow = { outlet_id: outletId, outlet_name: outletName, days };
      rowsMap.set(outletId, row);
      return row;
    };

    const ensureProduct = (
      key: string,
      productId: string | null,
      unmatched: boolean,
      isOffer: boolean,
      isGift: boolean,
    ) => {
      const existing = productsMap.get(key);
      if (!existing) {
        productsMap.set(key, {
          key,
          label: key,
          product_id: productId ?? null,
          unmatched,
          is_offer: isOffer,
          is_gift: isGift,
        });
        return;
      }
      if (!existing.product_id && productId) existing.product_id = productId;
      existing.unmatched = existing.unmatched || unmatched;
    };

    for (const r of salesRows) {
      const raw = (r.product_name_raw ?? '').trim();
      if (!raw) continue;
      const key =
        r.is_offer && !raw.toLowerCase().startsWith('offer')
          ? `Offer 20% ${raw}`
          : raw;
      const qty = Number(r.quantity ?? 0);
      const unmatched = !r.is_product_matched || r.product_id == null;
      ensureProduct(key, r.product_id ?? null, unmatched, Boolean(r.is_offer), false);

      const row = ensureRow(r.outlet_id, r.outlet_name);
      if (!row.days[r.report_date]) row.days[r.report_date] = { total: 0 };
      const existing = row.days[r.report_date][key] as PromoterCell | undefined;
      if (!existing) {
        row.days[r.report_date][key] = {
          quantity: qty,
          status: r.status,
          parsed_report_id: r.parsed_report_id,
        };
      } else {
        existing.quantity += qty;
      }
      row.days[r.report_date].total = Number(row.days[r.report_date].total ?? 0) + qty;
    }

    for (const r of sampleRows) {
      const raw = (r.product_name_raw ?? '').trim();
      const key = raw || 'Gift';
      const qty = Number(r.quantity ?? 0);
      const unmatched = !r.is_product_matched || r.product_id == null;
      ensureProduct(key, r.product_id ?? null, unmatched, false, true);

      const row = ensureRow(r.outlet_id, r.outlet_name);
      if (!row.days[r.report_date]) row.days[r.report_date] = { total: 0 };
      const existing = row.days[r.report_date][key] as PromoterCell | undefined;
      if (!existing) {
        row.days[r.report_date][key] = {
          quantity: qty,
          status: r.status,
          parsed_report_id: r.parsed_report_id,
        };
      } else {
        existing.quantity += qty;
      }
      row.days[r.report_date].total = Number(row.days[r.report_date].total ?? 0) + qty;
    }

    const products = Array.from(productsMap.values()).sort((a, b) => {
      const byGroup = this.productSortRank(a) - this.productSortRank(b);
      if (byGroup !== 0) return byGroup;
      return a.label.localeCompare(b.label);
    });

    const totals: Record<string, Record<string, number>> = {};
    for (const d of dates) {
      totals[d] = { total: 0 };
      for (const p of products) totals[d][p.key] = 0;
    }

    for (const row of rowsMap.values()) {
      for (const d of dates) {
        if (!row.days[d]) row.days[d] = { total: 0 };
        for (const p of products) {
          const cell = row.days[d][p.key] as PromoterCell | undefined;
          totals[d][p.key] += cell?.quantity ?? 0;
        }
        totals[d].total += Number(row.days[d].total ?? 0);
      }
    }

    return {
      brand: brands[0],
      date_range: { from: dateFrom, to: dateTo },
      dates,
      products,
      rows: Array.from(rowsMap.values()).sort((a, b) =>
        a.outlet_name.localeCompare(b.outlet_name),
      ),
      totals,
      feedback: feedbackRows,
    };
  }

  async exportToExcel(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<Buffer> {
    const data = await this.getPromoterDashboard(current, query);
    const workbook = new ExcelJS.Workbook();

    const productsPerDate = data.products.length;
    const dateBlockWidth = productsPerDate + 1; // + Total per day
    const feedbackCol = 2 + data.dates.length * dateBlockWidth;
    const lastCol = feedbackCol;

    const sheet = workbook.addWorksheet(
      this.sanitizeSheetName(
        `Promoter ${data.date_range.from ?? 'all'} - ${data.date_range.to ?? 'all'}`,
      ),
    );

    sheet.getCell(1, 1).value = 'i.prom';
    sheet.getCell(1, 2).value = 'Promotion and events';
    if (lastCol >= 2) sheet.mergeCells(1, 2, 1, lastCol);

    sheet.getCell(2, 1).value = '';
    sheet.getCell(2, 2).value = data.brand.name;
    sheet.getCell(2, feedbackCol).value = 'Feedback';
    let start = 3;
    for (const d of data.dates) {
      const end = start + dateBlockWidth - 1;
      sheet.getCell(2, start).value = d;
      sheet.mergeCells(2, start, 2, end);
      start = end + 1;
    }

    sheet.getCell(3, 1).value = 'Items';
    let col = 3;
    for (const _d of data.dates) {
      for (const p of data.products) {
        sheet.getCell(3, col).value = p.label;
        col++;
      }
      sheet.getCell(3, col).value = 'Total';
      col++;
    }
    sheet.getCell(3, feedbackCol).value = 'Feedback';

    const feedbackByOutlet = new Map<string, string[]>();
    for (const f of data.feedback) {
      if (!feedbackByOutlet.has(f.outlet_id)) feedbackByOutlet.set(f.outlet_id, []);
      feedbackByOutlet
        .get(f.outlet_id)!
        .push(`${f.date} | ${f.reporter_name ?? ''}: ${f.text}`);
    }

    let rowIdx = 4;
    for (const row of data.rows) {
      sheet.getCell(rowIdx, 1).value = row.outlet_name;
      sheet.getCell(rowIdx, 2).value = '';

      let c = 3;
      for (const d of data.dates) {
        for (const p of data.products) {
          const cell = row.days[d]?.[p.key] as PromoterCell | undefined;
          sheet.getCell(rowIdx, c).value = cell?.quantity ?? 0;
          c++;
        }
        sheet.getCell(rowIdx, c).value = Number(row.days[d]?.total ?? 0);
        c++;
      }
      sheet.getCell(rowIdx, feedbackCol).value = (
        feedbackByOutlet.get(row.outlet_id) ?? []
      ).join('\n');
      rowIdx++;
    }

    const totalRow = rowIdx;
    sheet.getCell(totalRow, 1).value = 'Total';
    sheet.getCell(totalRow, 2).value = '';
    let grandTotal = 0;
    let c = 3;
    for (const d of data.dates) {
      for (const p of data.products) {
        sheet.getCell(totalRow, c).value = data.totals[d]?.[p.key] ?? 0;
        c++;
      }
      const dayTotal = data.totals[d]?.total ?? 0;
      sheet.getCell(totalRow, c).value = dayTotal;
      grandTotal += dayTotal;
      c++;
    }
    sheet.getCell(totalRow, feedbackCol).value = grandTotal;

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).font = { bold: true };
    sheet.getRow(3).font = { bold: true };
    sheet.getRow(totalRow).font = { bold: true };

    const headerFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFEFEFEF' },
    };
    for (const r of [2, 3]) {
      for (let i = 1; i <= lastCol; i++) {
        sheet.getCell(r, i).fill = headerFill;
        sheet.getCell(r, i).alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }

    sheet.getRow(totalRow).fill = headerFill;

    for (const dIdx of data.dates.keys()) {
      const baseCol = 3 + dIdx * dateBlockWidth;
      for (let pIdx = 0; pIdx < data.products.length; pIdx++) {
        const p = data.products[pIdx];
        const color = this.productColor(p);
        if (!color) continue;
        const fill = {
          type: 'pattern' as const,
          pattern: 'solid' as const,
          fgColor: { argb: color },
        };
        const targetCol = baseCol + pIdx;
        for (let r = 3; r <= totalRow; r++) {
          sheet.getCell(r, targetCol).fill = fill;
        }
      }

      const totalCol = baseCol + data.products.length;
      for (let r = 3; r <= totalRow; r++) {
        sheet.getCell(r, totalCol).font = { bold: true };
      }
    }

    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 4;
    for (let i = 3; i < feedbackCol; i++) sheet.getColumn(i).width = 12;
    sheet.getColumn(feedbackCol).width = 70;
    for (let r = 4; r <= totalRow; r++) {
      sheet.getCell(r, feedbackCol).alignment = { wrapText: true, vertical: 'top' };
    }

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }
}

