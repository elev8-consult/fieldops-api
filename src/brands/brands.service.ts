import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Brand } from './entities/brand.entity';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
  ) {}

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

  async findOne(id: number, current: JwtUser): Promise<Brand> {
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

  async update(id: number, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    if (dto.name != null) brand.name = dto.name;
    if (dto.slug != null) brand.slug = dto.slug;
    if (dto.isActive != null) brand.isActive = dto.isActive;
    return this.brandRepo.save(brand);
  }

  async softDelete(id: number): Promise<void> {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    brand.isActive = false;
    await this.brandRepo.save(brand);
  }
}
