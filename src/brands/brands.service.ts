import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateBrandDto } from './dto/create-brand.dto';
import type { MatchBrandResponseDto } from './dto/match-brand-response.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Brand } from './entities/brand.entity';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
    private readonly dataSource: DataSource,
  ) {}

  async matchBrand(brandRaw: string): Promise<MatchBrandResponseDto> {
    if (!brandRaw || brandRaw.trim() === '') {
      return {
        brand_id: null,
        brand_name: null,
        match_confidence: 0,
        match_type: 'none',
        suggestions: [],
      };
    }

    const candidates = await this.dataSource.query<
      { id: string; name: string; confidence: number }[]
    >(
      `
      SELECT
        id,
        name,
        CASE
          WHEN lower(name) = lower($1)
            THEN 1.0
          WHEN lower(regexp_replace(name, '[^a-zA-Z0-9\\u0600-\\u06FF]', '', 'g'))
             = lower(regexp_replace($1,   '[^a-zA-Z0-9\\u0600-\\u06FF]', '', 'g'))
            THEN 0.95
          WHEN lower(name) LIKE '%' || lower($1) || '%'
            OR lower($1)   LIKE '%' || lower(name) || '%'
            THEN 0.85
          ELSE similarity(lower(name), lower($1))
        END AS confidence
      FROM brands
      WHERE is_active = true
        AND (
          lower(name) LIKE '%' || lower($1) || '%'
          OR lower($1) LIKE '%' || lower(name) || '%'
          OR similarity(lower(name), lower($1)) > 0.3
        )
      ORDER BY confidence DESC
      LIMIT 5
      `,
      [brandRaw.trim()],
    );

    if (!candidates.length) {
      return {
        brand_id: null,
        brand_name: null,
        match_confidence: 0,
        match_type: 'none',
        suggestions: [],
      };
    }

    const top = candidates[0];
    const confidence = parseFloat(top.confidence as unknown as string);

    const match_type: MatchBrandResponseDto['match_type'] =
      confidence >= 1.0
        ? 'exact'
        : confidence >= 0.95
          ? 'normalized'
          : confidence >= 0.75
            ? 'fuzzy'
            : 'none';

    return {
      brand_id: match_type !== 'none' ? top.id : null,
      brand_name: match_type !== 'none' ? top.name : null,
      match_confidence: confidence,
      match_type,
      suggestions: candidates.map((c) => ({
        brand_id: c.id,
        brand_name: c.name,
        confidence: parseFloat(c.confidence as unknown as string),
      })),
    };
  }

  async findAll(current: JwtUser): Promise<Brand[]> {
    const qb = this.brandRepo.createQueryBuilder('b').orderBy('b.name', 'ASC');

    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      qb.where('b.id = :id', { id: current.brandId });
    }

    return qb.getMany();
  }

  async findOne(id: string, current: JwtUser): Promise<Brand> {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    if (current.role === 'brand_manager' && current.brandId !== id) {
      throw new ForbiddenException('Out of brand scope');
    }
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    const brand = this.brandRepo.create({
      name: dto.name,
      slug: dto.slug,
      isActive: true,
    });
    return this.brandRepo.save(brand);
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    if (dto.name != null) brand.name = dto.name;
    if (dto.slug != null) brand.slug = dto.slug;
    if (dto.isActive != null) brand.isActive = dto.isActive;
    return this.brandRepo.save(brand);
  }

  async softDelete(id: string): Promise<void> {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    brand.isActive = false;
    await this.brandRepo.save(brand);
  }
}
