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
import { UserOutlet } from './entities/user-outlet.entity';
import { User } from './entities/user.entity';

/** Roles that log in from the mobile app via phone + OTP (no password). */
const MOBILE_ROLES = ['merchandiser', 'promoter'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserOutlet)
    private readonly userOutletRepo: Repository<UserOutlet>,
  ) {}

  /** Normalize a Lebanese phone to digits-only E.164 (no plus), matching OtpService. */
  static normalizePhone(raw: string): string {
    let d = (raw ?? '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '961' + d.slice(1);
    else if (d.length <= 8) d = '961' + d;
    return d;
  }

  /** Outlet ids a mobile user is assigned to. */
  async getAssignedOutletIds(userId: string): Promise<string[]> {
    const rows = await this.userOutletRepo.find({ where: { userId } });
    return rows.map((r) => r.outletId);
  }

  /** Replace a user's outlet assignments wholesale. */
  async setAssignedOutlets(userId: string, outletIds: string[]): Promise<void> {
    await this.userOutletRepo.delete({ userId });
    const unique = [...new Set(outletIds)];
    if (unique.length === 0) return;
    await this.userOutletRepo.insert(
      unique.map((outletId) => ({ userId, outletId })),
    );
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.brand', 'brand')
      .where('LOWER(TRIM(u.email)) = :email', { email: normalized })
      .getOne();
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id, isActive: true },
      relations: ['brand'],
    });
  }

  private assertBrandManagerScope(current: JwtUser, targetBrandId: string | null) {
    if (current.role !== 'brand_manager') return;
    if (current.brandId == null || targetBrandId !== current.brandId) {
      throw new ForbiddenException('Out of brand scope');
    }
  }

  async findAll(current: JwtUser, brandId?: string) {
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

  async findOne(id: string, current: JwtUser): Promise<User> {
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
    const isMobile = MOBILE_ROLES.includes(dto.role);

    // Super admins manage everyone; brand managers may only add field staff.
    if (current.role !== 'super_admin') {
      if (!(current.role === 'brand_manager' && isMobile)) {
        throw new ForbiddenException();
      }
      if (dto.brandId != null && dto.brandId !== current.brandId) {
        throw new ForbiddenException('Out of brand scope');
      }
    }

    if (dto.role === 'super_admin' && dto.brandId != null) {
      throw new ForbiddenException('Super admin cannot be tied to a brand');
    }
    if (dto.role === 'brand_manager' && dto.brandId == null) {
      throw new ForbiddenException('brandId is required for brand_manager');
    }

    // Mobile users sign in with their phone number, so it is mandatory and
    // must be unique. Email/password are optional for them.
    let phone: string | null = null;
    if (dto.whatsappPhone?.trim()) {
      phone = UsersService.normalizePhone(dto.whatsappPhone);
      const phoneTaken = await this.userRepo.exist({
        where: { whatsappPhone: phone },
      });
      if (phoneTaken) {
        throw new ForbiddenException('Phone number already in use');
      }
    } else if (isMobile) {
      throw new ForbiddenException('A phone number is required for app users');
    }

    const email = dto.email?.trim()
      ? dto.email.trim().toLowerCase()
      : `m_${phone}@fieldops.local`;

    const exists = await this.userRepo.exist({ where: { email } });
    if (exists) {
      throw new ForbiddenException('Email already in use');
    }

    if (!dto.password && !isMobile) {
      throw new ForbiddenException('A password is required for this role');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : null;

    const user = this.userRepo.create({
      fullName: dto.fullName,
      whatsappPhone: phone,
      email,
      passwordHash,
      role: dto.role,
      brandId:
        dto.role === 'super_admin'
          ? null
          : (dto.brandId ?? (current.role === 'brand_manager' ? current.brandId : null)),
      isActive: true,
      approvalStatus: 'approved',
    });
    const saved = await this.userRepo.save(user);

    if (dto.outletIds?.length) {
      await this.setAssignedOutlets(saved.id, dto.outletIds);
    }
    return saved;
  }

  async update(
    id: string,
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
    if (dto.whatsappPhone !== undefined) {
      user.whatsappPhone = dto.whatsappPhone?.trim()
        ? UsersService.normalizePhone(dto.whatsappPhone)
        : null;
    }
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

    const saved = await this.userRepo.save(user);

    if (dto.outletIds !== undefined) {
      await this.setAssignedOutlets(saved.id, dto.outletIds ?? []);
    }

    return saved;
  }

  async softDelete(id: string, current: JwtUser): Promise<void> {
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
