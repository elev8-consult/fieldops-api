import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

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
