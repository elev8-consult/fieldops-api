import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { MerchandiserDashboardQueryDto } from './dto/merchandiser-dashboard-query.dto';

interface PromoterPivotRow {
  outlet_id: string;
  outlet_name: string;
  days: Record<string, Record<string, number | null>>;
}

interface PromoterDashboardResponse {
  brand: { id: string; name: string };
  date_range: { from: string; to: string };
  products: string[];
  dates: string[];
  rows: PromoterPivotRow[];
  totals: Record<string, Record<string, number>>;
  feedback: Array<{
    outlet_name: string;
    date: string;
    reporter_name: string;
    text: string;
  }>;
}

@Injectable()
export class PromoterDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveBrandId(
    current: JwtUser,
    requestedBrandId: string,
  ): string {
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

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  private toRangeDates(from: string, to: string): string[] {
    const out: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    const cur = new Date(start);
    while (cur <= end) {
      out.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  private sanitizeSheetName(raw: string): string {
    return raw.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  }

  async getPromoterDashboard(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<PromoterDashboardResponse> {
    if (!query.brand_id) throw new BadRequestException('brand_id is required');

    const dateFrom = query.date_from ?? this.daysAgo(30);
    const dateTo = query.date_to ?? this.today();
    const brandId = this.resolveBrandId(current, query.brand_id);
    const dates = this.toRangeDates(dateFrom, dateTo);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const brandRows = (await qr.manager.query(
        `SELECT id::text AS id, name
         FROM brands
         WHERE id = $1
           AND is_active = true
         LIMIT 1`,
        [brandId],
      )) as Array<{ id: string; name: string }>;
      if (!brandRows[0]) throw new NotFoundException('Brand not found');
      const brand = brandRows[0];

      const outletRows = (await qr.manager.query(
        `SELECT DISTINCT
           o.id::text AS outlet_id,
           o.name AS outlet_name
         FROM parsed_reports pr
         JOIN outlets o ON o.id = pr.outlet_id
         WHERE pr.brand_id = $1
           AND pr.report_type = 'promoter'
           AND pr.status != 'draft'
           AND pr.report_date BETWEEN $2 AND $3
         ORDER BY o.name`,
        [brandId, dateFrom, dateTo],
      )) as Array<{ outlet_id: string; outlet_name: string }>;

      const salesRows = (await qr.manager.query(
        `SELECT
           pr.outlet_id::text AS outlet_id,
           pr.report_date::text AS report_date,
           psi.product_name_raw,
           psi.is_offer,
           psi.promo_label,
           SUM(COALESCE(psi.quantity, 0)) AS qty
         FROM parsed_reports pr
         JOIN promoter_reports prom ON prom.report_id = pr.id
         JOIN promoter_sale_items psi ON psi.promoter_report_id = prom.id
         WHERE pr.brand_id = $1
           AND pr.report_type = 'promoter'
           AND pr.status != 'draft'
           AND pr.report_date BETWEEN $2 AND $3
         GROUP BY
           pr.outlet_id,
           pr.report_date,
           psi.product_name_raw,
           psi.is_offer,
           psi.promo_label`,
        [brandId, dateFrom, dateTo],
      )) as Array<{
        outlet_id: string;
        report_date: string;
        product_name_raw: string | null;
        is_offer: boolean;
        promo_label: string | null;
        qty: string | number | null;
      }>;

      const giftRows = (await qr.manager.query(
        `SELECT
           pr.outlet_id::text AS outlet_id,
           pr.report_date::text AS report_date,
           SUM(COALESCE(psam.quantity, 0)) AS qty
         FROM parsed_reports pr
         JOIN promoter_reports prom ON prom.report_id = pr.id
         JOIN promoter_sample_items psam ON psam.promoter_report_id = prom.id
         WHERE pr.brand_id = $1
           AND pr.report_type = 'promoter'
           AND pr.status != 'draft'
           AND pr.report_date BETWEEN $2 AND $3
         GROUP BY
           pr.outlet_id,
           pr.report_date`,
        [brandId, dateFrom, dateTo],
      )) as Array<{
        outlet_id: string;
        report_date: string;
        qty: string | number | null;
      }>;

      const feedbackRows = (await qr.manager.query(
        `SELECT
           o.name AS outlet_name,
           pr.report_date::text AS date,
           COALESCE(u.full_name, pr.name_raw) AS reporter_name,
           prom.feedback_text AS text
         FROM parsed_reports pr
         JOIN promoter_reports prom ON prom.report_id = pr.id
         JOIN outlets o ON o.id = pr.outlet_id
         LEFT JOIN users u ON u.id = pr.reported_by
         WHERE pr.brand_id = $1
           AND pr.report_type = 'promoter'
           AND pr.status != 'draft'
           AND pr.report_date BETWEEN $2 AND $3
           AND prom.feedback_text IS NOT NULL
           AND btrim(prom.feedback_text) <> ''
         ORDER BY pr.report_date, o.name`,
        [brandId, dateFrom, dateTo],
      )) as Array<{
        outlet_name: string;
        date: string;
        reporter_name: string | null;
        text: string;
      }>;

      const baseProducts = new Set<string>();
      const offerProducts = new Set<string>();
      for (const row of salesRows) {
        const raw = row.product_name_raw?.trim();
        if (!raw) continue;
        const isPalette =
          raw.toLowerCase() === 'palette' ||
          (row.promo_label ?? '').toLowerCase().includes('palette');
        if (isPalette) continue;
        if (row.is_offer) {
          offerProducts.add(`Offer 20% ${raw}`);
        } else {
          baseProducts.add(raw);
        }
      }

      const products = [
        ...Array.from(baseProducts).sort((a, b) => a.localeCompare(b)),
        ...Array.from(offerProducts).sort((a, b) => a.localeCompare(b)),
        'Palette',
        'Gifts',
      ];

      const rowsMap = new Map<string, PromoterPivotRow>();
      const outletNameById = new Map<string, string>();
      for (const outlet of outletRows) {
        outletNameById.set(outlet.outlet_id, outlet.outlet_name);
        const days: Record<string, Record<string, number | null>> = {};
        for (const date of dates) {
          const cell: Record<string, number | null> = {};
          for (const product of products) cell[product] = null;
          cell.total = 0;
          days[date] = cell;
        }
        rowsMap.set(outlet.outlet_id, {
          outlet_id: outlet.outlet_id,
          outlet_name: outlet.outlet_name,
          days,
        });
      }

      const ensureOutlet = (outletId: string) => {
        if (rowsMap.has(outletId)) return rowsMap.get(outletId)!;
        const outletName = outletNameById.get(outletId) ?? outletId;
        const days: Record<string, Record<string, number | null>> = {};
        for (const date of dates) {
          const cell: Record<string, number | null> = {};
          for (const product of products) cell[product] = null;
          cell.total = 0;
          days[date] = cell;
        }
        const newRow: PromoterPivotRow = {
          outlet_id: outletId,
          outlet_name: outletName,
          days,
        };
        rowsMap.set(outletId, newRow);
        return newRow;
      };

      for (const row of salesRows) {
        const date = row.report_date;
        if (!dates.includes(date)) continue;
        const outlet = ensureOutlet(row.outlet_id);
        const qty = Number(row.qty ?? 0);
        const raw = row.product_name_raw?.trim();
        if (!raw) continue;
        const isPalette =
          raw.toLowerCase() === 'palette' ||
          (row.promo_label ?? '').toLowerCase().includes('palette');
        const productKey = isPalette
          ? 'Palette'
          : row.is_offer
            ? `Offer 20% ${raw}`
            : raw;
        if (!(productKey in outlet.days[date])) continue;
        const currentVal = outlet.days[date][productKey] ?? 0;
        outlet.days[date][productKey] = currentVal + qty;
      }

      for (const row of giftRows) {
        const date = row.report_date;
        if (!dates.includes(date)) continue;
        const outlet = ensureOutlet(row.outlet_id);
        const qty = Number(row.qty ?? 0);
        const currentVal = outlet.days[date].Gifts ?? 0;
        outlet.days[date].Gifts = currentVal + qty;
      }

      for (const outlet of rowsMap.values()) {
        for (const date of dates) {
          let total = 0;
          for (const product of products) {
            total += Number(outlet.days[date][product] ?? 0);
          }
          outlet.days[date].total = total;
        }
      }

      const totals: Record<string, Record<string, number>> = {};
      for (const date of dates) {
        const dayTotals: Record<string, number> = {};
        for (const product of products) dayTotals[product] = 0;
        dayTotals.total = 0;
        for (const outlet of rowsMap.values()) {
          for (const product of products) {
            dayTotals[product] += Number(outlet.days[date][product] ?? 0);
          }
          dayTotals.total += Number(outlet.days[date].total ?? 0);
        }
        totals[date] = dayTotals;
      }

      return {
        brand: { id: brand.id, name: brand.name },
        date_range: { from: dateFrom, to: dateTo },
        products,
        dates,
        rows: Array.from(rowsMap.values()).sort((a, b) =>
          a.outlet_name.localeCompare(b.outlet_name),
        ),
        totals,
        feedback: feedbackRows.map((f) => ({
          outlet_name: f.outlet_name,
          date: f.date,
          reporter_name: f.reporter_name ?? 'Unknown',
          text: f.text,
        })),
      };
    } finally {
      await qr.release();
    }
  }

  async exportToExcel(
    current: JwtUser,
    query: MerchandiserDashboardQueryDto,
  ): Promise<Buffer> {
    const data = await this.getPromoterDashboard(current, query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(
      this.sanitizeSheetName(
        `${data.brand.name} ${data.date_range.from} - ${data.date_range.to}`,
      ),
    );

    const columnsPerDate = data.products.length;
    const totalProductCols = columnsPerDate * data.dates.length;
    const feedbackCol = 2 + totalProductCols;

    sheet.getCell(1, 1).value = 'i.prom   Promotion and events';
    sheet.mergeCells(1, 1, 1, feedbackCol);

    sheet.getCell(2, 1).value = data.brand.name;
    for (let i = 0; i < data.dates.length; i++) {
      const startCol = 2 + i * columnsPerDate;
      const endCol = startCol + columnsPerDate - 1;
      sheet.getCell(2, startCol).value = data.dates[i];
      if (startCol < endCol) sheet.mergeCells(2, startCol, 2, endCol);
    }

    sheet.getCell(3, 1).value = 'Items';
    for (let i = 0; i < data.dates.length; i++) {
      for (let j = 0; j < data.products.length; j++) {
        const col = 2 + i * columnsPerDate + j;
        sheet.getCell(3, col).value = data.products[j];
      }
    }
    sheet.getCell(3, feedbackCol).value = 'Feedback';

    const feedbackByOutlet = new Map<string, string[]>();
    for (const f of data.feedback) {
      const key = f.outlet_name;
      const line = `${f.date} - ${f.reporter_name}: ${f.text}`;
      if (!feedbackByOutlet.has(key)) feedbackByOutlet.set(key, []);
      feedbackByOutlet.get(key)!.push(line);
    }

    let rowIdx = 4;
    for (const row of data.rows) {
      sheet.getCell(rowIdx, 1).value = row.outlet_name;
      for (let i = 0; i < data.dates.length; i++) {
        const date = data.dates[i];
        for (let j = 0; j < data.products.length; j++) {
          const product = data.products[j];
          const col = 2 + i * columnsPerDate + j;
          sheet.getCell(rowIdx, col).value = row.days[date][product];
        }
      }
      sheet.getCell(rowIdx, feedbackCol).value = (
        feedbackByOutlet.get(row.outlet_name) ?? []
      ).join('\n');
      rowIdx++;
    }

    sheet.getCell(rowIdx, 1).value = 'Total';
    for (let i = 0; i < data.dates.length; i++) {
      const date = data.dates[i];
      for (let j = 0; j < data.products.length; j++) {
        const product = data.products[j];
        const col = 2 + i * columnsPerDate + j;
        sheet.getCell(rowIdx, col).value = data.totals[date][product] ?? 0;
      }
    }

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).font = { bold: true };
    sheet.getRow(3).font = { bold: true };
    sheet.getRow(rowIdx).font = { bold: true };

    sheet.getColumn(1).width = 25;
    for (let c = 2; c < feedbackCol; c++) sheet.getColumn(c).width = 12;
    sheet.getColumn(feedbackCol).width = 60;
    sheet.views = [{ state: 'frozen', xSplit: 1 }];

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }
}

