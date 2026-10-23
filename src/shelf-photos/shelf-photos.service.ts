import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import type { ListShelfPhotosDto } from './dto/list-shelf-photos.dto';
import type { SaveShelfPhotoDto } from './dto/save-shelf-photo.dto';
import { ShelfPhotoStorage } from './shelf-photo-storage.service';

const BEIRUT_TODAY_SQL = `(now() AT TIME ZONE 'Asia/Beirut')::date`;

export interface VisitShelfPhoto {
  brandId: string;
  brandName: string;
  shelfId: string;
  kind: 'before' | 'after';
  url: string | null;
}

export interface ShelfPhotoPair {
  outletId: string;
  outletName: string;
  regionName: string | null;
  brandId: string;
  brandName: string;
  shelfId: string;
  /** 1-based order the shelves were created, matching the phone. */
  shelfIndex: number;
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
        shelf_id: string;
        shelf_index: string | number;
        visit_date: string;
        merchandiser_name: string;
        before_key: string | null;
        after_key: string | null;
      }>
    >(
      `SELECT
         o.id::text            AS outlet_id,
         o.name                AS outlet_name,
         r.name                AS region_name,
         b.id::text            AS brand_id,
         b.name                AS brand_name,
         p.shelf_id::text      AS shelf_id,
         p.shelf_index         AS shelf_index,
         p.visit_date::text    AS visit_date,
         u.full_name           AS merchandiser_name,
         p.before_key,
         p.after_key
       FROM (
         SELECT
           g.*,
           row_number() OVER (
             PARTITION BY g.outlet_id, g.brand_id, g.visit_date, g.reported_by
             ORDER BY g.first_at
           ) AS shelf_index
         FROM (
           SELECT
             outlet_id,
             brand_id,
             visit_date,
             reported_by,
             shelf_id,
             min(created_at) AS first_at,
             max(object_key) FILTER (WHERE kind = 'before') AS before_key,
             max(object_key) FILTER (WHERE kind = 'after')  AS after_key
           FROM shelf_photos
           WHERE visit_date BETWEEN $1::date AND $2::date
             AND ($3::uuid IS NULL OR brand_id = $3)
           GROUP BY outlet_id, brand_id, visit_date, reported_by, shelf_id
         ) g
       ) p
       JOIN outlets o ON o.id = p.outlet_id
       JOIN brands b  ON b.id = p.brand_id
       JOIN users u   ON u.id = p.reported_by
       LEFT JOIN regions r ON r.id = o.region_id
       WHERE p.before_key IS NOT NULL
          OR p.after_key IS NOT NULL
       ORDER BY p.visit_date DESC, o.name, b.name, p.shelf_index`,
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
        shelfId: row.shelf_id,
        shelfIndex: Number(row.shelf_index),
        visitDate: row.visit_date,
        merchandiserName: row.merchandiser_name,
        beforeUrl: row.before_key
          ? await this.storage.presign(row.before_key)
          : null,
        afterUrl: row.after_key
          ? await this.storage.presign(row.after_key)
          : null,
      })),
    );

    return {
      storageReady: this.storage.isConfigured(),
      outlets,
      visits,
    };
  }

  /** This merchandiser's pictures at one store today, including a lone before or after. */
  async visit(current: JwtUser, outletId: string) {
    await this.assertOutlet(outletId);
    const rows = await this.dataSource.query<
      Array<{
        brand_id: string;
        brand_name: string;
        shelf_id: string;
        kind: 'before' | 'after';
        object_key: string;
      }>
    >(
      `SELECT
         b.id::text       AS brand_id,
         b.name           AS brand_name,
         p.shelf_id::text AS shelf_id,
         p.kind,
         p.object_key
       FROM shelf_photos p
       JOIN brands b ON b.id = p.brand_id
       WHERE p.reported_by = $1
         AND p.outlet_id = $2
         AND p.visit_date = ${BEIRUT_TODAY_SQL}
       ORDER BY b.name, p.created_at, p.kind`,
      [current.id, outletId],
    );

    const photos: VisitShelfPhoto[] = await Promise.all(
      rows.map(async (row) => ({
        brandId: row.brand_id,
        brandName: row.brand_name,
        shelfId: row.shelf_id,
        kind: row.kind,
        url: await this.storage.presign(row.object_key),
      })),
    );
    return { photos };
  }

  async save(
    current: JwtUser,
    dto: SaveShelfPhotoDto,
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
  ): Promise<VisitShelfPhoto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A photo is required.');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('The photo must be an image.');
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Photo storage is not configured.',
      );
    }

    await this.assertOutlet(dto.outletId);
    const brandRows = await this.dataSource.query<Array<{ name: string }>>(
      `SELECT name FROM brands WHERE id = $1 AND is_active = true`,
      [dto.brandId],
    );
    const brandName = brandRows[0]?.name;
    if (!brandName) {
      throw new BadRequestException('Unknown brand.');
    }

    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const shelfId = await this.resolveShelfId(current.id, dto);
    const objectKey = `shelf/${date}/${dto.outletId}/${current.id}/${dto.brandId}/${shelfId}/${dto.kind}-${Date.now()}.jpg`;
    await this.storage.put(objectKey, file.buffer, 'image/jpeg');

    await this.dataSource.query(
      `INSERT INTO shelf_photos
         (brand_id, outlet_id, reported_by, visit_date, shelf_id, kind, object_key)
       VALUES ($1, $2, $3, ${BEIRUT_TODAY_SQL}, $4, $5, $6)
       ON CONFLICT (reported_by, outlet_id, brand_id, visit_date, shelf_id, kind)
       DO UPDATE SET object_key = EXCLUDED.object_key, created_at = now()`,
      [dto.brandId, dto.outletId, current.id, shelfId, dto.kind, objectKey],
    );

    return {
      brandId: dto.brandId,
      brandName,
      shelfId,
      kind: dto.kind,
      url: await this.storage.presign(objectKey),
    };
  }

  async remove(current: JwtUser, dto: SaveShelfPhotoDto): Promise<void> {
    await this.assertOutlet(dto.outletId);
    const rows = await this.dataSource.query<Array<{ object_key: string }>>(
      `DELETE FROM shelf_photos
       WHERE id IN (
         SELECT id
         FROM shelf_photos
         WHERE reported_by = $1
           AND outlet_id = $2
           AND brand_id = $3
           AND kind = $4
           AND visit_date = ${BEIRUT_TODAY_SQL}
           AND ($5::uuid IS NULL OR shelf_id = $5)
         ORDER BY created_at
         LIMIT 1
       )
       RETURNING object_key`,
      [current.id, dto.outletId, dto.brandId, dto.kind, dto.shelfId ?? null],
    );
    for (const row of rows) {
      try {
        await this.storage.remove(row.object_key);
      } catch {
        // The row is gone, so the picture no longer shows.
      }
    }
  }

  /** Photos from the previous app have no shelf, so they stay on the first one. */
  private async resolveShelfId(
    userId: string,
    dto: SaveShelfPhotoDto,
  ): Promise<string> {
    if (dto.shelfId) return dto.shelfId;
    const rows = await this.dataSource.query<Array<{ shelf_id: string }>>(
      `SELECT shelf_id::text AS shelf_id
       FROM shelf_photos
       WHERE reported_by = $1
         AND outlet_id = $2
         AND brand_id = $3
         AND visit_date = ${BEIRUT_TODAY_SQL}
       ORDER BY created_at
       LIMIT 1`,
      [userId, dto.outletId, dto.brandId],
    );
    return rows[0]?.shelf_id ?? randomUUID();
  }

  private async assertOutlet(outletId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM outlets WHERE id = $1`,
      [outletId],
    );
    if (!rows.length) {
      throw new BadRequestException(
        'Unknown store. Pull down to refresh your store list.',
      );
    }
  }
}
