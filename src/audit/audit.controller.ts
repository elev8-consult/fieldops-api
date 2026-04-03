import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';
import { User } from '../users/entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Get()
  @Roles('super_admin', 'brand_manager')
  async list(
    @CurrentUser() current: JwtUser,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('user_id') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, page != null && page !== '' ? parseInt(page, 10) : 1);
    const l = Math.min(
      100,
      Math.max(1, limit != null && limit !== '' ? parseInt(limit, 10) : 20),
    );

    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .orderBy('a.created_at', 'DESC');

    if (entityType) {
      qb.andWhere('a.entity_type = :et', { et: entityType });
    }
    if (entityId != null && entityId !== '') {
      qb.andWhere('a.entity_id = :eid', { eid: parseInt(entityId, 10) });
    }
    if (userId != null && userId !== '') {
      qb.andWhere('a.user_id = :uid', { uid: parseInt(userId, 10) });
    }

    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        return { data: [], total: 0, page: p, limit: l };
      }
      const peers = await this.userRepo.find({
        where: { brandId: current.brandId },
        select: ['id'],
      });
      const ids = peers.map((u) => u.id);
      if (!ids.length) {
        return { data: [], total: 0, page: p, limit: l };
      }
      qb.andWhere('a.user_id IN (:...ids)', { ids });
    }

    const total = await qb.clone().getCount();
    const data = await qb
      .skip((p - 1) * l)
      .take(l)
      .getMany();

    return { data, total, page: p, limit: l };
  }
}
