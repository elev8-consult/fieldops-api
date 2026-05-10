import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ParsedReportStatus } from '../../common/enums/schema.enums';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import type { DashboardFilterDto } from './dto/dashboard-filter.dto';
import type { GridResponseDto, GridRowDto } from './dto/grid-response.dto';

type GridSqlRow = {
  outlet_id: string;
  outlet_name: string;
  outlet_type: string;
  region_id: string | null;
  region_name: string | null;
  report_date: string;
  report_status: string;
  parsed_report_id: string;
  promoter_name: string;
  product_id: string | null;
  product_name: string | null;
  sort_order: number | null;
  is_offer: boolean | null;
  qty_sold: string;
};

@Injectable()
export class PromoterDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private resolveBrandId(current: JwtUser, requestedBrandId: string) {
    if (current.role === 'brand_manager') {
      if (!current.brandId) {
        throw new ForbiddenException('Brand manager has no brand scope');
      }
      if (requestedBrandId !== current.brandId) {
        throw new ForbiddenException('Out of brand scope');
      }
      return current.brandId;
    }
    return requestedBrandId;
  }

  private normalizeStatusList(status?: ParsedReportStatus[]) {
    if (!status || status.length === 0) {
      return null;
    }
    return status;
  }

  async getSummary(current: JwtUser, filter: DashboardFilterDto) {
    const brandId = this.resolveBrandId(current, filter.brand_id);
    const statuses = this.normalizeStatusList(filter.status);

    const [summary] = await this.dataSource.query<
      Array<{
        outlets_visited: string;
        reports_count: string;
        qty_sold: string;
        qty_gifts: string;
      }>
    >(
      `
      SELECT
        COUNT(DISTINCT pr.outlet_id)::text AS outlets_visited,
        COUNT(DISTINCT pr.id)::text AS reports_count,
        COALESCE(SUM(psi.quantity), 0)::text AS qty_sold,
        COALESCE(SUM(psam.quantity), 0)::text AS qty_gifts
      FROM parsed_reports pr
      JOIN promoter_reports pmr ON pmr.report_id = pr.id
      LEFT JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
      LEFT JOIN promoter_sample_items psam ON psam.promoter_report_id = pmr.id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND ($4::text[] IS NULL OR pr.status = ANY($4::parsed_report_status[]))
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      `,
      [
        brandId,
        filter.date_from,
        filter.date_to,
        statuses,
        filter.outlet_id ?? null,
        filter.reported_by ?? null,
      ],
    );

    return {
      outlets_visited: Number(summary?.outlets_visited ?? 0),
      reports_count: Number(summary?.reports_count ?? 0),
      qty_sold: Number(summary?.qty_sold ?? 0),
      qty_gifts: Number(summary?.qty_gifts ?? 0),
    };
  }

  async getGrid(current: JwtUser, filter: DashboardFilterDto): Promise<GridResponseDto> {
    const brandId = this.resolveBrandId(current, filter.brand_id);
    const statuses = this.normalizeStatusList(filter.status);

    const rows = await this.dataSource.query<GridSqlRow[]>(
      `
      SELECT
        o.id                              AS outlet_id,
        o.name                            AS outlet_name,
        o.type                            AS outlet_type,
        r.id                              AS region_id,
        r.name                            AS region_name,
        pr.report_date,
        pr.status                         AS report_status,
        pr.id                             AS parsed_report_id,
        u.full_name                       AS promoter_name,
        psi.product_id,
        p.canonical_name                  AS product_name,
        p.sort_order                      AS sort_order,
        psi.is_offer,
        COALESCE(SUM(psi.quantity), 0)    AS qty_sold
      FROM parsed_reports pr
      JOIN outlets o                      ON o.id  = pr.outlet_id
      LEFT JOIN regions r                 ON r.id  = o.region_id
      JOIN users u                        ON u.id  = pr.reported_by
      JOIN promoter_reports pmr           ON pmr.report_id = pr.id
      LEFT JOIN promoter_sale_items psi   ON psi.promoter_report_id = pmr.id
      LEFT JOIN products p                ON p.id = psi.product_id
      WHERE
        pr.report_type  = 'promoter'
        AND pr.brand_id  = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND ($4::text[] IS NULL OR pr.status = ANY($4::parsed_report_status[]))
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      GROUP BY
        o.id, o.name, o.type, r.id, r.name,
        pr.report_date, pr.status, pr.id,
        u.full_name, psi.product_id, p.canonical_name, p.sort_order, psi.is_offer
      ORDER BY o.name, pr.report_date, p.sort_order, p.canonical_name
      `,
      [
        brandId,
        filter.date_from,
        filter.date_to,
        statuses,
        filter.outlet_id ?? null,
        filter.reported_by ?? null,
      ],
    );

    const giftRows = await this.dataSource.query<
      Array<{ outlet_id: string; report_date: string; qty_gifts: string }>
    >(
      `
      SELECT
        pr.outlet_id::text AS outlet_id,
        pr.report_date::text AS report_date,
        COALESCE(SUM(psam.quantity), 0) AS qty_gifts
      FROM parsed_reports pr
      JOIN promoter_reports pmr             ON pmr.report_id = pr.id
      LEFT JOIN promoter_sample_items psam  ON psam.promoter_report_id = pmr.id
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id    = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND ($4::text[] IS NULL OR pr.status = ANY($4::parsed_report_status[]))
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
      GROUP BY pr.outlet_id, pr.report_date
      `,
      [
        brandId,
        filter.date_from,
        filter.date_to,
        statuses,
        filter.outlet_id ?? null,
        filter.reported_by ?? null,
      ],
    );

    const flags = await this.dataSource.query<
      Array<{ report_id: string; flag_code: string; severity: string; message: string }>
    >(
      `
      SELECT rf.report_id::text AS report_id, rf.flag_code, rf.severity, rf.message
      FROM report_flags rf
      JOIN parsed_reports pr ON pr.id = rf.report_id
      WHERE pr.brand_id   = $1
        AND pr.report_date BETWEEN $2 AND $3
        AND ($4::text[] IS NULL OR pr.status = ANY($4::parsed_report_status[]))
        AND ($5::uuid IS NULL OR pr.outlet_id = $5::uuid)
        AND ($6::uuid IS NULL OR pr.reported_by = $6::uuid)
        AND rf.status     = 'open'
        AND rf.severity   = 'error'
      `,
      [
        brandId,
        filter.date_from,
        filter.date_to,
        statuses,
        filter.outlet_id ?? null,
        filter.reported_by ?? null,
      ],
    );

    const dates = Array.from(new Set(rows.map((row) => row.report_date))).sort();

    const productsMap = new Map<string, { id: string; canonical_name: string; is_offer: boolean }>();
    for (const row of rows) {
      if (!row.product_id && !row.product_name) continue;
      const offer = Boolean(row.is_offer);
      const key = offer
        ? `offer:${row.product_id ?? row.product_name ?? 'offer'}`
        : String(row.product_id);
      if (!productsMap.has(key)) {
        productsMap.set(key, {
          id: key,
          canonical_name: row.product_name ?? 'Unknown Product',
          is_offer: offer,
        });
      }
    }
    const products = Array.from(productsMap.values()).sort((a, b) =>
      a.canonical_name.localeCompare(b.canonical_name),
    );

    const flagByReportId = new Map<string, string[]>();
    for (const flag of flags) {
      const currentMessages = flagByReportId.get(flag.report_id) ?? [];
      currentMessages.push(flag.message);
      flagByReportId.set(flag.report_id, currentMessages);
    }

    const outletRows = new Map<string, GridRowDto>();
    for (const row of rows) {
      const qty = Number(row.qty_sold ?? 0);
      const productId = row.is_offer
        ? `offer:${row.product_id ?? row.product_name ?? 'offer'}`
        : (row.product_id ?? '');
      const outlet = outletRows.get(row.outlet_id) ?? {
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        outlet_type: row.outlet_type,
        region_name: row.region_name,
        has_flags: false,
        pending_review: false,
        flag_messages: [],
        cells: {},
        palette: {},
        gifts: {},
        row_total: 0,
      };

      if (flagByReportId.has(row.parsed_report_id)) {
        outlet.has_flags = true;
        outlet.flag_messages.push(...(flagByReportId.get(row.parsed_report_id) ?? []));
      }
      if (row.report_status === 'pending_review') {
        outlet.pending_review = true;
      }

      if (productId) {
        outlet.cells[row.report_date] ??= {};
        outlet.cells[row.report_date][productId] =
          (outlet.cells[row.report_date][productId] ?? 0) + qty;
      }
      outlet.row_total += qty;
      outletRows.set(row.outlet_id, outlet);
    }

    for (const gift of giftRows) {
      const outlet = outletRows.get(gift.outlet_id);
      if (!outlet) continue;
      const qty = Number(gift.qty_gifts ?? 0);
      outlet.gifts[gift.report_date] = (outlet.gifts[gift.report_date] ?? 0) + qty;
      outlet.row_total += qty;
    }

    const outletList = Array.from(outletRows.values()).sort((a, b) =>
      a.outlet_name.localeCompare(b.outlet_name),
    );

    const columnTotals: Record<string, number> = {};
    for (const product of products) {
      columnTotals[product.id] = 0;
    }
    let giftsTotal = 0;
    let paletteTotal = 0;
    let grandTotal = 0;

    for (const outlet of outletList) {
      for (const date of dates) {
        for (const product of products) {
          const qty = outlet.cells[date]?.[product.id] ?? 0;
          columnTotals[product.id] = (columnTotals[product.id] ?? 0) + qty;
          grandTotal += qty;
        }
        const gifts = outlet.gifts[date] ?? 0;
        giftsTotal += gifts;
        grandTotal += gifts;
        const palette = outlet.palette[date] ?? 0;
        paletteTotal += palette;
        grandTotal += palette;
      }
    }

    return {
      dates,
      products,
      rows: outletList.map((outlet) => ({
        ...outlet,
        flag_messages: Array.from(new Set(outlet.flag_messages)),
      })),
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
    filter: DashboardFilterDto,
  ) {
    const brandId = this.resolveBrandId(current, filter.brand_id);
    const statuses = this.normalizeStatusList(filter.status);

    const [outlet] = await this.dataSource.query<
      Array<{ id: string; name: string; type: string; region_name: string | null }>
    >(
      `
      SELECT o.id::text AS id, o.name, o.type, r.name AS region_name
      FROM outlets o
      LEFT JOIN regions r ON r.id = o.region_id
      WHERE o.id = $1::uuid
      `,
      [outletId],
    );
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    const reports = await this.dataSource.query<
      Array<{
        report_id: string;
        report_date: string;
        status: string;
        promoter_id: string | null;
        promoter_name: string | null;
      }>
    >(
      `
      SELECT
        pr.id::text AS report_id,
        pr.report_date::text AS report_date,
        pr.status,
        u.id::text AS promoter_id,
        u.full_name AS promoter_name
      FROM parsed_reports pr
      LEFT JOIN users u ON u.id = pr.reported_by
      WHERE pr.report_type = 'promoter'
        AND pr.brand_id = $1
        AND pr.outlet_id = $2::uuid
        AND pr.report_date BETWEEN $3 AND $4
        AND ($5::text[] IS NULL OR pr.status = ANY($5::parsed_report_status[]))
      ORDER BY pr.report_date DESC, pr.created_at DESC
      `,
      [brandId, outletId, filter.date_from, filter.date_to, statuses],
    );

    const reportIds = reports.map((row) => row.report_id);
    const salesRows =
      reportIds.length > 0
        ? await this.dataSource.query<
            Array<{
              report_id: string;
              id: string;
              product_id: string | null;
              product_name_raw: string;
              quantity: number | null;
              promo_label: string | null;
              is_offer: boolean;
              is_product_matched: boolean;
              match_confidence: number | null;
              match_type: string | null;
            }>
          >(
            `
            SELECT
              pr.id::text AS report_id,
              psi.id::text AS id,
              psi.product_id::text AS product_id,
              psi.product_name_raw,
              psi.quantity,
              psi.promo_label,
              psi.is_offer,
              psi.is_product_matched,
              psi.match_confidence,
              psi.match_type
            FROM parsed_reports pr
            JOIN promoter_reports pmr ON pmr.report_id = pr.id
            JOIN promoter_sale_items psi ON psi.promoter_report_id = pmr.id
            WHERE pr.id = ANY($1::uuid[])
            ORDER BY pr.report_date DESC, psi.created_at ASC
            `,
            [reportIds],
          )
        : [];

    const sampleRows =
      reportIds.length > 0
        ? await this.dataSource.query<
            Array<{
              report_id: string;
              id: string;
              product_id: string | null;
              product_name_raw: string;
              quantity: number | null;
              availability_note: string | null;
              is_product_matched: boolean;
              sample_match_confidence: number | null;
              sample_match_type: string | null;
            }>
          >(
            `
            SELECT
              pr.id::text AS report_id,
              psam.id::text AS id,
              psam.product_id::text AS product_id,
              psam.product_name_raw,
              psam.quantity,
              psam.availability_note,
              psam.is_product_matched,
              psam.match_confidence AS sample_match_confidence,
              psam.match_type AS sample_match_type
            FROM parsed_reports pr
            JOIN promoter_reports pmr ON pmr.report_id = pr.id
            JOIN promoter_sample_items psam ON psam.promoter_report_id = pmr.id
            WHERE pr.id = ANY($1::uuid[])
            ORDER BY pr.report_date DESC, psam.created_at ASC
            `,
            [reportIds],
          )
        : [];

    const salesByReport = new Map<string, typeof salesRows>();
    for (const row of salesRows) {
      const existing = salesByReport.get(row.report_id) ?? [];
      existing.push(row);
      salesByReport.set(row.report_id, existing);
    }
    const samplesByReport = new Map<string, typeof sampleRows>();
    for (const row of sampleRows) {
      const existing = samplesByReport.get(row.report_id) ?? [];
      existing.push(row);
      samplesByReport.set(row.report_id, existing);
    }

    return {
      outlet: {
        id: outlet.id,
        name: outlet.name,
        type: outlet.type,
        region_name: outlet.region_name,
      },
      reports: reports.map((report) => ({
        ...report,
        sales: salesByReport.get(report.report_id) ?? [],
        samples: samplesByReport.get(report.report_id) ?? [],
      })),
    };
  }
}
