import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../common/interfaces/jwt-user.interface';
import { WhatsappMessage } from './entities/whatsapp-message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly msgRepo: Repository<WhatsappMessage>,
  ) {}

  async findAll(filters: {
    status?:      string;
    reportType?:  string;
    brandId?:     string;
    senderPhone?: string;
    from?:        string;
    to?:          string;
    page?:        number;
    limit?:       number;
  }) {
    const {
      status,
      reportType,
      brandId,
      senderPhone,
      from,
      to,
      page  = 1,
      limit = 20,
    } = filters;

    const query = this.msgRepo
      .createQueryBuilder('m')
      .orderBy('m.received_at', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (status)      query.andWhere('m.status = :status',            { status });
    if (reportType)  query.andWhere('m.report_type = :reportType',   { reportType });
    if (senderPhone) query.andWhere('m.sender_phone = :senderPhone', { senderPhone });
    if (from)        query.andWhere('m.received_at >= :from',        { from });
    if (to)          query.andWhere('m.received_at <= :to',          { to });

    if (brandId) {
      query.innerJoin(
        'parsed_reports',
        'pr',
        'pr.message_id = m.id AND pr.brand_id = :brandId',
        { brandId },
      );
    }

    const [data, total] = await query.getManyAndCount();
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
