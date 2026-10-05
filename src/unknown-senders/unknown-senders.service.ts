import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtUser } from '../common/interfaces/jwt-user.interface';

export interface UnknownSenderRow {
  id: string;
  sender_phone: string;
  sender_name: string | null;
  seen_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_brand_id: string | null;
  resolved_at: string | null;
}

const COLUMNS = `
  id::text, sender_phone, sender_name, seen_count, first_seen_at,
  last_seen_at, resolved_brand_id::text AS resolved_brand_id, resolved_at`;

@Injectable()
export class UnknownSendersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list(resolved?: boolean): Promise<UnknownSenderRow[]> {
    const where =
      resolved === true
        ? 'WHERE resolved_brand_id IS NOT NULL'
        : resolved === false
          ? 'WHERE resolved_brand_id IS NULL'
          : '';
    return this.dataSource.query<UnknownSenderRow[]>(
      `SELECT ${COLUMNS} FROM unknown_senders ${where}
       ORDER BY last_seen_at DESC
       LIMIT 500`,
    );
  }

  async findOne(id: string): Promise<UnknownSenderRow> {
    const rows = await this.dataSource.query<UnknownSenderRow[]>(
      `SELECT ${COLUMNS} FROM unknown_senders WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Unknown sender not found');
    return rows[0];
  }

  async resolve(
    id: string,
    brandId: string,
    current: JwtUser,
  ): Promise<UnknownSenderRow> {
    const brand = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM brands WHERE id = $1`,
      [brandId],
    );
    if (!brand.length) throw new BadRequestException('Brand not found');

    const before = await this.findOne(id);
    const [rows] = await this.dataSource.query<[UnknownSenderRow[], number]>(
      `UPDATE unknown_senders
       SET resolved_brand_id = $2, resolved_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, brandId],
    );

    await this.auditService.log(
      current.id,
      'unknown_sender',
      id,
      'resolve',
      'resolved_brand_id',
      before.resolved_brand_id,
      brandId,
    );

    return rows[0];
  }
}
