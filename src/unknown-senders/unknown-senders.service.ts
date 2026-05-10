import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnknownSender } from './entities/unknown-sender.entity';

@Injectable()
export class UnknownSendersService {
  constructor(
    @InjectRepository(UnknownSender)
    private readonly unknownSenderRepo: Repository<UnknownSender>,
  ) {}

  list(resolved?: string): Promise<UnknownSender[]> {
    const qb = this.unknownSenderRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.resolvedBrand', 'brand')
      .orderBy('u.last_seen_at', 'DESC');

    if (resolved === 'true') {
      qb.andWhere('u.resolved_brand_id IS NOT NULL');
    } else if (resolved === 'false') {
      qb.andWhere('u.resolved_brand_id IS NULL');
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<UnknownSender> {
    const row = await this.unknownSenderRepo.findOne({
      where: { id },
      relations: ['resolvedBrand'],
    });
    if (!row) {
      throw new NotFoundException('Unknown sender not found');
    }
    return row;
  }

  async resolve(id: string, brandId: string): Promise<UnknownSender> {
    const row = await this.findOne(id);
    row.resolvedBrandId = brandId;
    row.resolvedAt = new Date();
    return this.unknownSenderRepo.save(row);
  }
}
