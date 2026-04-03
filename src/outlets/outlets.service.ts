import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { Outlet } from './entities/outlet.entity';

@Injectable()
export class OutletsService {
  constructor(
    @InjectRepository(Outlet)
    private readonly outletRepo: Repository<Outlet>,
  ) {}

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
