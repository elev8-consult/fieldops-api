import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateAliasDto } from './dto/create-alias.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductAlias } from './entities/product-alias.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
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

  async matchProductBatch(
    brandId: string,
    items: Array<{ product_name_raw: string }>,
  ): Promise<
    Array<{
      product_name_raw: string;
      product_id: string | null;
      canonical_name: string | null;
      match_confidence: number;
      match_type: 'exact' | 'alias' | 'fuzzy' | 'none';
      suggestions: Array<{
        productId: string;
        canonicalName: string;
        confidence: number;
      }>;
    }>
  > {
    const results = await Promise.all(
      items.map(async (item) => {
        const match = await this.fuzzyMatchProduct(brandId, item.product_name_raw);
        return {
          product_name_raw: item.product_name_raw,
          product_id: match.productId,
          canonical_name: match.canonicalName,
          match_confidence: match.matchConfidence,
          match_type: match.matchType,
          suggestions: match.suggestions,
        };
      }),
    );
    return results;
  }

  private assertBrandProduct(current: JwtUser, productBrandId: number) {
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
    const intRegex = /^\d+$/;

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
      } else if (intRegex.test(trimmed)) {
        query.andWhere('p.brand_id = :brandId', { brandId: parseInt(trimmed, 10) });
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

  async findOne(id: number, current: JwtUser): Promise<Product> {
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
    id: number,
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

  async softDelete(id: number, current: JwtUser): Promise<void> {
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

  async listAliases(productId: number, current: JwtUser): Promise<ProductAlias[]> {
    await this.findOne(productId, current);
    return this.aliasRepo.find({
      where: { productId },
      relations: ['createdBy'],
      order: { id: 'ASC' },
    });
  }

  async addAlias(
    productId: number,
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

  async removeAlias(aliasId: number, current: JwtUser): Promise<void> {
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
