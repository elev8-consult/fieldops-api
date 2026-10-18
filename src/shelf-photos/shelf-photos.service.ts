import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { ListShelfPhotosDto } from './dto/list-shelf-photos.dto';
import { ShelfPhotoStorage } from './shelf-photo-storage.service';

export interface ShelfPhotoPair {
  outletId: string;
  outletName: string;
  regionName: string | null;
  brandId: string;
  brandName: string;
  visitDate: string;
  merchandiserName: string;
  beforeUrl: string | null;
  afterUrl: string | null;
}

export interface ShelfPhotoOutletOption {
  id: string;
  name: string;
}

@Injectable()
export class ShelfPhotosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ShelfPhotoStorage,
  ) {}

  async list(current: JwtUser, query: ListShelfPhotosDto) {
    if (query.dateFrom > query.dateTo) {
      throw new BadRequestException('Date from must be on or before date to.');
    }

    const brandId =
      current.role === 'brand_manager' ? current.brandId : null;
    if (current.role === 'brand_manager' && !brandId) {
      return { storageReady: this.storage.isConfigured(), outlets: [], visits: [] };
    }

    const rows = await this.dataSource.query<
      Array<{
        outlet_id: string;
        outlet_name: string;
        region_name: string | null;
        brand_id: string;
        brand_name: string;
        visit_date: string;
        merchandiser_name: string;
        before_key: string;
        after_key: string;
      }>
    >(
      `SELECT
         o.id::text            AS outlet_id,
         o.name                AS outlet_name,
         r.name                AS region_name,
         b.id::text            AS brand_id,
         b.name                AS brand_name,
         p.visit_date::text    AS visit_date,
         u.full_name           AS merchandiser_name,
         p.before_key,
         p.after_key
       FROM (
         SELECT
           outlet_id,
           brand_id,
           visit_date,
           reported_by,
           max(object_key) FILTER (WHERE kind = 'before') AS before_key,
           max(object_key) FILTER (WHERE kind = 'after')  AS after_key
         FROM shelf_photos
         WHERE visit_date BETWEEN $1::date AND $2::date
           AND ($3::uuid IS NULL OR brand_id = $3)
         GROUP BY outlet_id, brand_id, visit_date, reported_by
       ) p
       JOIN outlets o ON o.id = p.outlet_id
       JOIN brands b  ON b.id = p.brand_id
       JOIN users u   ON u.id = p.reported_by
       LEFT JOIN regions r ON r.id = o.region_id
       WHERE p.before_key IS NOT NULL
         AND p.after_key IS NOT NULL
       ORDER BY p.visit_date DESC, o.name, b.name`,
      [query.dateFrom, query.dateTo, brandId],
    );

    const outlets: ShelfPhotoOutletOption[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.outlet_id)) continue;
      seen.add(row.outlet_id);
      outlets.push({ id: row.outlet_id, name: row.outlet_name });
    }
    outlets.sort((a, b) => a.name.localeCompare(b.name));

    const chosen = query.outletId
      ? rows.filter((row) => row.outlet_id === query.outletId)
      : rows;

    const visits: ShelfPhotoPair[] = await Promise.all(
      chosen.map(async (row) => ({
        outletId: row.outlet_id,
        outletName: row.outlet_name,
        regionName: row.region_name,
        brandId: row.brand_id,
        brandName: row.brand_name,
        visitDate: row.visit_date,
        merchandiserName: row.merchandiser_name,
        beforeUrl: await this.storage.presign(row.before_key),
        afterUrl: await this.storage.presign(row.after_key),
      })),
    );

    return {
      storageReady: this.storage.isConfigured(),
      outlets,
      visits,
    };
  }
}
