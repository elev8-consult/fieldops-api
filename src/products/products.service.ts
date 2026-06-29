import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateAliasDto } from './dto/create-alias.dto';
import { CreateProductDto } from './dto/create-product.dto';
import type {
  ImportCatalogResult,
  ImportRowResult,
} from './dto/import-catalog.dto';
import {
  MatchProductsDto,
  type MatchProductsResponse,
  type MatchResult,
} from './dto/match-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductAlias } from './entities/product-alias.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductAlias)
    private readonly aliasRepo: Repository<ProductAlias>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Fuzzy match a raw product name against a brand's catalog.
   */
  async fuzzyMatchProduct(
    brandId: string,
    rawName: string,
  ): Promise<{
    productId: string | null;
    canonicalName: string | null;
    matchConfidence: number;
    matchType: 'exact' | 'alias' | 'fuzzy' | 'none';
    suggestions: Array<{
      productId: string;
      canonicalName: string;
      confidence: number;
    }>;
  }> {
    if (!rawName || rawName.trim().length < 2) {
      return {
        productId: null,
        canonicalName: null,
        matchConfidence: 0,
        matchType: 'none',
        suggestions: [],
      };
    }

    const normalized = rawName.trim().toLowerCase();

    const exactResult = await this.dataSource.query<
      { id: string; canonical_name: string }[]
    >(
      `SELECT p.id::text AS id, p.canonical_name
       FROM products p
       WHERE p.brand_id::text = $1
         AND p.is_active = true
         AND lower(p.canonical_name) = lower($2)
       LIMIT 1`,
      [brandId, normalized],
    );

    if (exactResult.length > 0) {
      return {
        productId: exactResult[0].id,
        canonicalName: exactResult[0].canonical_name,
        matchConfidence: 1,
        matchType: 'exact',
        suggestions: [],
      };
    }

    const aliasExact = await this.dataSource.query<
      { product_id: string; canonical_name: string }[]
    >(
      `SELECT pa.product_id::text AS product_id, p.canonical_name
       FROM product_aliases pa
       JOIN products p ON p.id = pa.product_id
       WHERE p.brand_id::text = $1
         AND p.is_active = true
         AND lower(pa.alias) = lower($2)
       LIMIT 1`,
      [brandId, normalized],
    );

    if (aliasExact.length > 0) {
      return {
        productId: aliasExact[0].product_id,
        canonicalName: aliasExact[0].canonical_name,
        matchConfidence: 1,
        matchType: 'alias',
        suggestions: [],
      };
    }

    const fuzzyResults = await this.dataSource.query<
      { product_id: string; canonical_name: string; sim: number; source: string }[]
    >(
      `WITH canonical_sims AS (
         SELECT
           p.id::text AS product_id,
           p.canonical_name,
           similarity(lower(p.canonical_name), lower($2)) AS sim,
           'canonical' AS source
         FROM products p
         WHERE p.brand_id::text = $1
           AND p.is_active = true
           AND similarity(lower(p.canonical_name), lower($2)) > 0.25
       ),
       alias_sims AS (
         SELECT
           p.id::text AS product_id,
           p.canonical_name,
           similarity(lower(pa.alias), lower($2)) AS sim,
           'alias' AS source
         FROM product_aliases pa
         JOIN products p ON p.id = pa.product_id
         WHERE p.brand_id::text = $1
           AND p.is_active = true
           AND similarity(lower(pa.alias), lower($2)) > 0.25
       ),
       all_sims AS (
         SELECT * FROM canonical_sims
         UNION ALL
         SELECT * FROM alias_sims
       ),
       best_per_product AS (
         SELECT DISTINCT ON (product_id)
           product_id, canonical_name, sim, source
         FROM all_sims
         ORDER BY product_id, sim DESC
       )
       SELECT product_id, canonical_name, sim, source
       FROM best_per_product
       ORDER BY sim DESC
       LIMIT 5`,
      [brandId, normalized],
    );

    if (fuzzyResults.length === 0) {
      return {
        productId: null,
        canonicalName: null,
        matchConfidence: 0,
        matchType: 'none',
        suggestions: [],
      };
    }

    const best = fuzzyResults[0];
    const confidence = parseFloat(String(best.sim));
    const suggestions = fuzzyResults.map((r) => ({
      productId: r.product_id,
      canonicalName: r.canonical_name,
      confidence: parseFloat(String(r.sim)),
    }));

    if (confidence >= 0.55) {
      return {
        productId: best.product_id,
        canonicalName: best.canonical_name,
        matchConfidence: confidence,
        matchType: 'fuzzy',
        suggestions,
      };
    }

    return {
      productId: null,
      canonicalName: null,
      matchConfidence: confidence,
      suggestions,
      matchType: 'none',
    };
  }

  private async resolveBrandIdByRaw(brandRaw: string): Promise<string | null> {
    if (!brandRaw || brandRaw.trim() === '') {
      return null;
    }

    const rows = await this.dataSource.query<Array<{ id: string | number }>>(
      `
      SELECT id
      FROM brands
      WHERE (lower(name) = lower($1) OR name ILIKE '%' || $1 || '%')
        AND is_active = true
      LIMIT 1
      `,
      [brandRaw.trim()],
    );

    return rows[0] ? String(rows[0].id) : null;
  }

  async matchProducts(dto: MatchProductsDto): Promise<MatchProductsResponse> {
    const items = dto.items;
    if (!items || items.length === 0) {
      return { results: [] };
    }

    try {
      const brandId = dto.brandId?.trim() || null;
      let resolvedBrandId: string | null = brandId;

      if (!resolvedBrandId && dto.brandRaw?.trim()) {
        resolvedBrandId = await this.resolveBrandIdByRaw(dto.brandRaw);
      }

      const results: MatchResult[] = [];

      for (const item of items) {
        const originalRaw = item.product_name_raw ?? '';
        const raw = originalRaw.trim();

        if (!raw) {
          results.push({
            product_name_raw: originalRaw,
            product_id: null,
            canonical_name: null,
            match_confidence: 0,
            match_type: 'none',
            suggestions: [],
          });
          continue;
        }

        const brandClause = resolvedBrandId ? 'AND p.brand_id::text = $2' : '';
        const baseParams = resolvedBrandId ? [raw, resolvedBrandId] : [raw];

        const exact = await this.dataSource.query<
          Array<{ id: string | number; canonical_name: string }>
        >(
          `
          SELECT p.id, p.canonical_name
          FROM products p
          WHERE lower(p.canonical_name) = lower($1)
            AND p.is_active = true
            ${brandClause}
          LIMIT 1
          `,
          baseParams,
        );

        if (exact[0]) {
          results.push({
            product_name_raw: originalRaw,
            product_id: String(exact[0].id),
            canonical_name: exact[0].canonical_name,
            match_confidence: 1,
            match_type: 'exact',
            suggestions: [],
          });
          continue;
        }

        const alias = await this.dataSource.query<
          Array<{ id: string | number; canonical_name: string }>
        >(
          `
          SELECT p.id, p.canonical_name
          FROM product_aliases pa
          JOIN products p ON p.id = pa.product_id
          WHERE lower(pa.alias) = lower($1)
            AND p.is_active = true
            ${brandClause}
          LIMIT 1
          `,
          baseParams,
        );

        if (alias[0]) {
          results.push({
            product_name_raw: originalRaw,
            product_id: String(alias[0].id),
            canonical_name: alias[0].canonical_name,
            match_confidence: 0.95,
            match_type: 'alias',
            suggestions: [],
          });
          continue;
        }

        const fuzzy = await this.dataSource.query<
          Array<{ id: string | number; canonical_name: string; score: string | number }>
        >(
          `
          SELECT
            p.id,
            p.canonical_name,
            similarity(lower(p.canonical_name), lower($1)) AS score
          FROM products p
          WHERE p.is_active = true
            ${brandClause}
            AND similarity(lower(p.canonical_name), lower($1)) > 0.3
          ORDER BY score DESC
          LIMIT 5
          `,
          baseParams,
        );

        if (fuzzy.length === 0 && resolvedBrandId) {
          const pattern = `%${raw}%`;
          const ilike = await this.dataSource.query<
            Array<{ id: string | number; canonical_name: string; brand_id: string }>
          >(
            `
            SELECT p.id, p.canonical_name, p.brand_id
            FROM products p
            WHERE p.is_active = true
              AND p.brand_id = $1
              AND (
                p.canonical_name ILIKE $2
                OR EXISTS (
                  SELECT 1 FROM product_aliases pa
                  WHERE pa.product_id = p.id
                    AND pa.alias ILIKE $2
                )
              )
            LIMIT 5
            `,
            [resolvedBrandId, pattern],
          );

          results.push({
            product_name_raw: originalRaw,
            product_id: null,
            canonical_name: null,
            match_confidence: ilike.length > 0 ? 0.5 : 0,
            match_type: ilike.length > 0 ? 'ilike' : 'none',
            suggestions: ilike.map((row) => ({
              product_id: String(row.id),
              canonical_name: row.canonical_name,
              confidence: 0.5,
            })),
          });
          continue;
        }

        const suggestions = fuzzy.map((row) => ({
          product_id: String(row.id),
          canonical_name: row.canonical_name,
          confidence: parseFloat(String(row.score)),
        }));

        const topConfidence = fuzzy[0] ? parseFloat(String(fuzzy[0].score)) : 0;

        if (fuzzy[0] && topConfidence >= 0.5) {
          results.push({
            product_name_raw: originalRaw,
            product_id: String(fuzzy[0].id),
            canonical_name: fuzzy[0].canonical_name,
            match_confidence: topConfidence,
            match_type: 'fuzzy',
            suggestions,
          });
        } else {
          results.push({
            product_name_raw: originalRaw,
            product_id: null,
            canonical_name: null,
            match_confidence: topConfidence,
            match_type: 'none',
            suggestions,
          });
        }
      }

      return { results };
    } catch (error) {
      this.logger.error('products.match failed', { error } as any);
      return {
        results: [],
        error: 'match_unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async matchProductBatch(
    brandId: string,
    items: Array<{ product_name_raw: string }>,
    brandRaw?: string,
  ): Promise<MatchResult[]> {
    const out = await this.matchProducts({
      brandId,
      brandRaw,
      items,
    });
    return out.results;
  }

  private assertBrandProduct(current: JwtUser, productBrandId: string) {
    if (current.role !== 'brand_manager') return;
    if (current.brandId == null || current.brandId !== productBrandId) {
      throw new ForbiddenException('Out of brand scope');
    }
  }

  async findAll(filters?: {
    brandId?: string;
    flow?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      brandId,
      flow,
      search,
      page = 1,
      limit = 100,
    } = filters ?? {};

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Build base query without any joins.
    // Joins can cause TypeORM databaseName errors when relation metadata can't be resolved.
    const query = this.productRepo
      .createQueryBuilder('p')
      .where('p.is_active = true')
      .orderBy('p.canonical_name', 'ASC')
      .take(limit)
      .skip((page - 1) * limit);

    // Apply brand filter only if it is a valid UUID or integer string
    if (brandId && typeof brandId === 'string') {
      const trimmed = brandId.trim();
      if (uuidRegex.test(trimmed)) {
        query.andWhere('p.brand_id = :brandId', { brandId: trimmed });
      }
    }

    if (flow && typeof flow === 'string' && flow.length > 0) {
      query.andWhere('p.flow IN (:...flows)', {
        flows:
          flow === 'both'
            ? ['merchandiser', 'promoter', 'both']
            : [flow, 'both'],
      });
    }

    if (search && typeof search === 'string' && search.length > 0) {
      const q = search.trim();
      if (q.length > 0) {
        query.andWhere('(p.canonical_name ILIKE :q OR p.sku ILIKE :q)', {
          q: `%${q}%`,
        });
      }
    }

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, current: JwtUser): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['brand'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (current.role === 'brand_manager') {
      this.assertBrandProduct(current, product.brandId);
    }
    return product;
  }

  async create(dto: CreateProductDto, current: JwtUser): Promise<Product> {
    if (current.role === 'brand_manager') {
      if (current.brandId !== dto.brandId) {
        throw new ForbiddenException('Cannot create product for another brand');
      }
    }

    const product = this.productRepo.create({
      brandId: dto.brandId,
      canonicalName: dto.canonicalName,
      sku: dto.sku ?? null,
      flow: dto.flow,
      unit: dto.unit ?? null,
      isActive: true,
    });
    return this.productRepo.save(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    current: JwtUser,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (current.role === 'brand_manager') {
      this.assertBrandProduct(current, product.brandId);
    }

    if (current.role === 'brand_manager' && dto.brandId != null) {
      throw new ForbiddenException('Cannot change brand');
    }

    if (dto.brandId != null) product.brandId = dto.brandId;
    if (dto.canonicalName != null) product.canonicalName = dto.canonicalName;
    if (dto.sku !== undefined) product.sku = dto.sku;
    if (dto.flow != null) product.flow = dto.flow;
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.isActive != null && current.role === 'super_admin') {
      product.isActive = dto.isActive;
    }

    return this.productRepo.save(product);
  }

  async findByBarcode(barcode: string): Promise<Product> {
    const normalized = (barcode ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('Barcode is required');
    }
    const product = await this.productRepo.findOne({
      where: { barcode: normalized, isActive: true },
      relations: ['brand'],
    });
    if (!product) {
      throw new NotFoundException('No product matches this barcode');
    }
    return product;
  }

  /**
   * Bulk import a single brand's catalog from an uploaded Excel file.
   * For each row: match an existing product in the brand (by SKU, then by
   * canonical name) and set its barcode; if no match, create a new product.
   * Barcodes are globally unique, so a barcode already used by a different
   * product is reported as a conflict and left untouched.
   */
  async importCatalog(
    brandId: string,
    fileBuffer: Buffer,
    current: JwtUser,
    dryRun: boolean,
  ): Promise<ImportCatalogResult> {
    if (current.role === 'brand_manager' && current.brandId !== brandId) {
      throw new ForbiddenException('Cannot import for another brand');
    }

    const brandExists = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM brands WHERE id::text = $1 LIMIT 1`,
      [brandId],
    );
    if (brandExists.length === 0) {
      throw new BadRequestException('Brand not found');
    }

    const parsed = await this.parseCatalogWorkbook(fileBuffer);

    const result: ImportCatalogResult = {
      brandId,
      dryRun,
      totalRows: parsed.length,
      created: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      rows: [],
    };

    await this.dataSource.transaction(async (manager) => {
      for (const r of parsed) {
        const row: ImportRowResult = {
          row: r.rowNumber,
          productName: r.name,
          sku: r.sku,
          barcode: r.barcode,
          status: 'skipped',
        };

        if (!r.name && !r.barcode) {
          row.reason = 'Empty row';
          result.skipped++;
          result.rows.push(row);
          continue;
        }
        if (!r.barcode) {
          row.reason = 'Missing barcode';
          result.skipped++;
          result.rows.push(row);
          continue;
        }
        if (!r.name) {
          row.reason = 'Missing product name';
          result.skipped++;
          result.rows.push(row);
          continue;
        }

        // Barcode must be globally unique. If it already belongs to another
        // product, flag the conflict instead of stealing it.
        const barcodeOwner = await manager.query<
          Array<{ id: string; brand_id: string }>
        >(
          `SELECT id::text AS id, brand_id::text AS brand_id
           FROM products WHERE barcode = $1 LIMIT 1`,
          [r.barcode],
        );

        // Find an existing product in this brand: prefer SKU, then exact name.
        let match: { id: string; barcode: string | null } | null = null;
        if (r.sku) {
          const bySku = await manager.query<
            Array<{ id: string; barcode: string | null }>
          >(
            `SELECT id::text AS id, barcode FROM products
             WHERE brand_id::text = $1 AND lower(sku) = lower($2)
             LIMIT 1`,
            [brandId, r.sku],
          );
          if (bySku[0]) match = bySku[0];
        }
        if (!match) {
          const byName = await manager.query<
            Array<{ id: string; barcode: string | null }>
          >(
            `SELECT id::text AS id, barcode FROM products
             WHERE brand_id::text = $1 AND lower(canonical_name) = lower($2)
             LIMIT 1`,
            [brandId, r.name],
          );
          if (byName[0]) match = byName[0];
        }

        if (
          barcodeOwner[0] &&
          (!match || barcodeOwner[0].id !== match.id)
        ) {
          row.status = 'conflict';
          row.productId = match?.id ?? null;
          row.reason =
            barcodeOwner[0].brand_id === brandId
              ? 'Barcode already assigned to a different product'
              : 'Barcode already used by a product in another brand';
          result.conflicts++;
          result.rows.push(row);
          continue;
        }

        if (match) {
          row.status = 'updated';
          row.productId = match.id;
          if (!dryRun) {
            await manager.query(
              `UPDATE products
               SET barcode = $1,
                   sku = COALESCE(NULLIF($2, ''), sku),
                   updated_at = now()
               WHERE id::text = $3`,
              [r.barcode, r.sku ?? '', match.id],
            );
          }
          result.updated++;
        } else {
          row.status = 'created';
          if (!dryRun) {
            const inserted = await manager.query<Array<{ id: string }>>(
              `INSERT INTO products
                 (brand_id, canonical_name, sku, barcode, flow, is_active)
               VALUES ($1, $2, NULLIF($3, ''), $4, 'both', true)
               RETURNING id::text AS id`,
              [brandId, r.name, r.sku ?? '', r.barcode],
            );
            row.productId = inserted[0]?.id ?? null;
          }
          result.created++;
        }

        result.rows.push(row);
      }
    });

    return result;
  }

  /** Parse the first worksheet into normalized rows. Header names are flexible. */
  private async parseCatalogWorkbook(buffer: Buffer): Promise<
    Array<{ rowNumber: number; name: string | null; sku: string | null; barcode: string | null }>
  > {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Could not read the Excel file');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount === 0) {
      throw new BadRequestException('The spreadsheet is empty');
    }

    const norm = (v: unknown) =>
      String(v ?? '')
        .toLowerCase()
        .replace(/[\s_\-.]/g, '');

    const nameKeys = ['name', 'productname', 'product', 'canonicalname', 'item', 'description', 'اسم', 'المنتج'];
    const skuKeys = ['sku', 'code', 'productcode', 'itemcode', 'ref', 'reference', 'رمز'];
    const barcodeKeys = ['barcode', 'gtin', 'ean', 'ean13', 'upc', 'code128', 'باركود'];

    const headerRow = sheet.getRow(1);
    const colMap: { name?: number; sku?: number; barcode?: number } = {};
    headerRow.eachCell((cell, col) => {
      const key = norm(cell.value);
      if (!colMap.name && nameKeys.includes(key)) colMap.name = col;
      else if (!colMap.sku && skuKeys.includes(key)) colMap.sku = col;
      else if (!colMap.barcode && barcodeKeys.includes(key)) colMap.barcode = col;
    });

    if (!colMap.name || !colMap.barcode) {
      throw new BadRequestException(
        'Could not find required columns. Expected a "name"/"product" column and a "barcode"/"gtin" column in the first row.',
      );
    }

    const cellStr = (row: ExcelJS.Row, col?: number): string | null => {
      if (!col) return null;
      const cell = row.getCell(col);
      let v = cell.value;
      if (v && typeof v === 'object' && 'text' in (v as any)) v = (v as any).text;
      if (v && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result;
      const s = String(v ?? '').trim();
      return s.length ? s : null;
    };

    const rows: Array<{ rowNumber: number; name: string | null; sku: string | null; barcode: string | null }> = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const name = cellStr(row, colMap.name);
      const sku = cellStr(row, colMap.sku);
      let barcode = cellStr(row, colMap.barcode);
      // Excel often stores barcodes as numbers → strip a trailing ".0"
      if (barcode) barcode = barcode.replace(/\.0+$/, '');
      if (!name && !sku && !barcode) continue; // truly blank line
      rows.push({ rowNumber: i, name, sku, barcode });
    }

    return rows;
  }

  async softDelete(id: string, current: JwtUser): Promise<void> {
    if (current.role !== 'super_admin') {
      throw new ForbiddenException();
    }
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    product.isActive = false;
    await this.productRepo.save(product);
  }

  async listAliases(productId: string, current: JwtUser): Promise<ProductAlias[]> {
    await this.findOne(productId, current);
    return this.aliasRepo.find({
      where: { productId },
      relations: ['createdBy'],
      order: { id: 'ASC' },
    });
  }

  async addAlias(
    productId: string,
    dto: CreateAliasDto,
    current: JwtUser,
  ): Promise<ProductAlias> {
    const product = await this.findOne(productId, current);
    if (current.role === 'brand_manager') {
      this.assertBrandProduct(current, product.brandId);
    }

    const row = this.aliasRepo.create({
      productId,
      alias: dto.alias.trim(),
      createdById: current.id,
    });
    return this.aliasRepo.save(row);
  }

  async removeAlias(aliasId: string, current: JwtUser): Promise<void> {
    const alias = await this.aliasRepo.findOne({
      where: { id: aliasId },
      relations: ['product', 'product.brand'],
    });
    if (!alias) {
      throw new NotFoundException('Alias not found');
    }
    if (current.role === 'brand_manager') {
      this.assertBrandProduct(current, alias.product.brandId);
    }
    await this.aliasRepo.remove(alias);
  }
}
