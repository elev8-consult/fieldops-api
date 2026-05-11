import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateOutletDto } from './dto/create-outlet.dto';
import type { MatchOutletResponseDto } from './dto/match-outlet-response.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { Outlet } from './entities/outlet.entity';

@Injectable()
export class OutletsService {
  constructor(
    @InjectRepository(Outlet)
    private readonly outletRepo: Repository<Outlet>,
    private readonly dataSource: DataSource,
  ) {}

  async matchOutlet(
    locationRaw: string,
    brandId?: string,
  ): Promise<MatchOutletResponseDto> {
    void brandId;

    if (!locationRaw || locationRaw.trim() === '') {
      return {
        outlet_id: null,
        outlet_name: null,
        match_confidence: 0,
        match_type: 'none',
        is_depot: false,
        suggestions: [],
      };
    }

    const candidates = await this.dataSource.query<
      { id: string; name: string; is_depot: boolean; confidence: number }[]
    >(
      `
      SELECT
        id,
        name,
        is_depot,
        CASE
          WHEN lower(name) = lower($1)
            THEN 1.0
          WHEN lower(regexp_replace(name, '[^a-zA-Z0-9\\u0600-\\u06FF]', '', 'g'))
             = lower(regexp_replace($1,   '[^a-zA-Z0-9\\u0600-\\u06FF]', '', 'g'))
            THEN 0.95
          WHEN lower(name) LIKE '%' || lower($1) || '%'
            OR lower($1)   LIKE '%' || lower(name) || '%'
            THEN 0.80
          ELSE similarity(lower(name), lower($1))
        END AS confidence
      FROM outlets
      WHERE is_active = true
        AND (
          lower(name) LIKE '%' || lower($1) || '%'
          OR lower($1) LIKE '%' || lower(name) || '%'
          OR similarity(lower(name), lower($1)) > 0.3
        )
      ORDER BY confidence DESC
      LIMIT 5
      `,
      [locationRaw.trim()],
    );

    if (!candidates.length) {
      return {
        outlet_id: null,
        outlet_name: null,
        match_confidence: 0,
        match_type: 'none',
        is_depot: false,
        suggestions: [],
      };
    }

    const top = candidates[0];
    const confidence = parseFloat(top.confidence as unknown as string);

    const match_type: MatchOutletResponseDto['match_type'] =
      confidence >= 1.0
        ? 'exact'
        : confidence >= 0.95
          ? 'normalized'
          : confidence >= 0.75
            ? 'fuzzy'
            : 'none';

    return {
      outlet_id: match_type !== 'none' ? top.id : null,
      outlet_name: match_type !== 'none' ? top.name : null,
      match_confidence: confidence,
      match_type,
      is_depot: top.is_depot ?? false,
      suggestions: candidates.map((c) => ({
        outlet_id: c.id,
        outlet_name: c.name,
        confidence: parseFloat(c.confidence as unknown as string),
      })),
    };
  }

  async findAll(
    current: JwtUser,
    filters: {
      regionId?: number;
      isDepot?: boolean;
      search?: string;
    },
  ): Promise<Outlet[]> {
    if (current.role === 'promoter' || current.role === 'merchandiser') {
      throw new ForbiddenException();
    }

    const qb = this.outletRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.region', 'region')
      .where('o.is_active = true')
      .orderBy('o.name', 'ASC');

    if (filters.regionId != null) {
      qb.andWhere('o.region_id = :rid', { rid: filters.regionId });
    }
    if (filters.isDepot != null) {
      qb.andWhere('o.is_depot = :depot', { depot: filters.isDepot });
    }
    if (filters.search?.trim()) {
      qb.andWhere('o.name ILIKE :q', { q: `%${filters.search.trim()}%` });
    }

    return qb.getMany();
  }

  async findOne(id: number, current: JwtUser): Promise<Outlet> {
    if (current.role === 'promoter' || current.role === 'merchandiser') {
      throw new ForbiddenException();
    }

    const outlet = await this.outletRepo.findOne({
      where: { id },
      relations: ['region'],
    });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }
    return outlet;
  }

  async create(dto: CreateOutletDto): Promise<Outlet> {
    const outlet = this.outletRepo.create({
      name: dto.name,
      type: dto.type,
      isDepot: dto.isDepot ?? false,
      regionId: dto.regionId,
      address: dto.address ?? null,
      isActive: true,
    });
    return this.outletRepo.save(outlet);
  }

  async update(id: number, dto: UpdateOutletDto): Promise<Outlet> {
    const outlet = await this.outletRepo.findOne({ where: { id } });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }
    if (dto.name != null) outlet.name = dto.name;
    if (dto.type != null) outlet.type = dto.type;
    if (dto.isDepot != null) outlet.isDepot = dto.isDepot;
    if (dto.regionId != null) outlet.regionId = dto.regionId;
    if (dto.address !== undefined) outlet.address = dto.address;
    if (dto.isActive != null) outlet.isActive = dto.isActive;
    return this.outletRepo.save(outlet);
  }

  async softDelete(id: number): Promise<void> {
    const outlet = await this.outletRepo.findOne({ where: { id } });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }
    outlet.isActive = false;
    await this.outletRepo.save(outlet);
  }
}
