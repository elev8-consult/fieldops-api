import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.brand', 'brand')
      .where('LOWER(TRIM(u.email)) = :email', { email: normalized })
      .getOne();
  }

  async findActiveById(id: number): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id, isActive: true },
      relations: ['brand'],
    });
  }

  private assertBrandManagerScope(current: JwtUser, targetBrandId: number | null) {
    if (current.role !== 'brand_manager') return;
    if (current.brandId == null || targetBrandId !== current.brandId) {
      throw new ForbiddenException('Out of brand scope');
    }
  }

  async findAll(current: JwtUser, brandId?: number) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.brand', 'brand')
      .orderBy('u.id', 'ASC');

    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      qb.andWhere('u.brand_id = :bid', { bid: current.brandId });
    } else if (brandId != null) {
      qb.andWhere('u.brand_id = :bid', { bid: brandId });
    }

    return qb.getMany();
  }

  async findOne(id: number, current: JwtUser): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['brand'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (current.role === 'brand_manager') {
      this.assertBrandManagerScope(current, user.brandId);
    }
    return user;
  }

  async create(dto: CreateUserDto, current: JwtUser): Promise<User> {
    if (current.role !== 'super_admin') {
      throw new ForbiddenException();
    }

    if (dto.role === 'super_admin' && dto.brandId != null) {
      throw new ForbiddenException('Super admin cannot be tied to a brand');
    }
    if (dto.role === 'brand_manager' && dto.brandId == null) {
      throw new ForbiddenException('brandId is required for brand_manager');
    }

    const email = dto.email.trim().toLowerCase();
    const exists = await this.userRepo.exist({ where: { email } });
    if (exists) {
      throw new ForbiddenException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      fullName: dto.fullName,
      whatsappPhone: dto.whatsappPhone ?? null,
      email,
      passwordHash,
      role: dto.role,
      brandId:
        dto.role === 'super_admin'
          ? null
          : (dto.brandId ?? null),
      isActive: true,
    });
    return this.userRepo.save(user);
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    current: JwtUser,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (current.role === 'brand_manager') {
      this.assertBrandManagerScope(current, user.brandId);
      if (dto.role != null && dto.role !== user.role) {
        throw new ForbiddenException('Cannot change role');
      }
      if (dto.brandId != null && dto.brandId !== user.brandId) {
        throw new ForbiddenException('Cannot change brand');
      }
    } else if (current.role !== 'super_admin') {
      throw new ForbiddenException();
    }

    if (dto.fullName != null) user.fullName = dto.fullName;
    if (dto.whatsappPhone !== undefined) user.whatsappPhone = dto.whatsappPhone;
    if (dto.email != null) user.email = dto.email.trim().toLowerCase();
    if (dto.password != null) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
    }
    if (dto.role != null && current.role === 'super_admin') {
      user.role = dto.role;
    }
    if (dto.brandId !== undefined && current.role === 'super_admin') {
      user.brandId = dto.brandId;
    }
    if (dto.isActive != null && current.role === 'super_admin') {
      user.isActive = dto.isActive;
    }

    return this.userRepo.save(user);
  }

  async softDelete(id: number, current: JwtUser): Promise<void> {
    if (current.role !== 'super_admin') {
      throw new ForbiddenException();
    }
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isActive = false;
    await this.userRepo.save(user);
  }
}
