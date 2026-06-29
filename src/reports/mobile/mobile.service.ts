import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import {
  MobileItemDto,
  SubmitMobileReportDto,
} from './dto/submit-mobile-report.dto';

@Injectable()
export class MobileService {
  constructor(private readonly dataSource: DataSource) {}

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
      current.brandId ?? (distinctBrands.length === 1 ? distinctBrands[0] : null);

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
      const arr = groups.get(fallbackBrand) ?? groups.set(fallbackBrand, []).get(fallbackBrand)!;
      arr.push(...unmatched);
    }

    if (groups.size === 0) {
      throw new BadRequestException('No items to submit.');
    }

    const reportDate = new Date().toISOString().slice(0, 10);
    const reportIds: string[] = [];
    let itemCount = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const [brandId, items] of groups) {
        const parsed = await manager.query<Array<{ id: string }>>(
          `INSERT INTO parsed_reports
             (message_id, brand_id, outlet_id, reported_by, report_date,
              report_type, status, confidence, is_depot_report, source)
           VALUES (NULL, $1, $2, $3, $4,
              'merchandiser'::report_type, 'approved'::parsed_report_status,
              1, false, 'mobile_app')
           RETURNING id::text AS id`,
          [brandId, dto.outletId, current.id, reportDate],
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

    return { reportId: reportIds[0], reportIds, itemCount };
  }
}
