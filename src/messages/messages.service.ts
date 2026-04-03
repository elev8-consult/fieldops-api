import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { WhatsappMessage } from './entities/whatsapp-message.entity';

export interface MessageListQuery {
  status?: string;
  reportType?: string;
  brandId?: number;
  senderPhone?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly msgRepo: Repository<WhatsappMessage>,
  ) {}

  async findAll(current: JwtUser, q: MessageListQuery) {
    if (current.role === 'promoter' || current.role === 'merchandiser') {
      throw new ForbiddenException();
    }

    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .orderBy('m.received_at', 'DESC');

    let brandFilter = q.brandId;
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      brandFilter = current.brandId;
    }

    if (brandFilter != null) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM parsed_reports pr WHERE pr.message_id = m.id AND pr.brand_id = :bid)`,
        { bid: brandFilter },
      );
    }

    if (q.status) {
      qb.andWhere('m.status = :st', { st: q.status });
    }
    if (q.reportType) {
      qb.andWhere('m.report_type = :rt', { rt: q.reportType });
    }
    if (q.senderPhone?.trim()) {
      qb.andWhere('m.sender_phone = :sp', { sp: q.senderPhone.trim() });
    }
    if (q.from) {
      qb.andWhere('m.received_at >= :from', { from: new Date(q.from) });
    }
    if (q.to) {
      qb.andWhere('m.received_at <= :to', { to: new Date(q.to) });
    }

    const total = await qb.clone().getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOne(id: number, current: JwtUser): Promise<WhatsappMessage> {
    if (current.role === 'promoter' || current.role === 'merchandiser') {
      throw new ForbiddenException();
    }

    const msg = await this.msgRepo.findOne({ where: { id } });
    if (!msg) {
      throw new NotFoundException('Message not found');
    }

    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException();
      }
      const linked = await this.msgRepo.manager.query(
        `SELECT 1 FROM parsed_reports WHERE message_id = $1 AND brand_id = $2 LIMIT 1`,
        [id, current.brandId],
      );
      if (!linked?.length) {
        throw new ForbiddenException('Out of brand scope');
      }
    }

    return msg;
  }
}
