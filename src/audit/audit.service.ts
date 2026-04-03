import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(
    userId: number | null,
    entityType: string,
    entityId: number,
    action: string,
    fieldName?: string | null,
    oldValue?: string | null,
    newValue?: string | null,
  ): Promise<void> {
    const row = this.auditRepo.create({
      userId,
      entityType,
      entityId,
      action,
      fieldName: fieldName ?? null,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
    });
    await this.auditRepo.save(row);
  }
}
