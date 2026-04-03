import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { MerchandiserReportItem } from './entities/merchandiser-report-item.entity';
import { MerchandiserReport } from './entities/merchandiser-report.entity';
import { UpdateMerchandiserItemDto } from './dto/update-merchandiser-item.dto';
import { UpdateMerchandiserReportDto } from './dto/update-merchandiser-report.dto';

export interface MerchListQuery {
  brandId?: number;
  outletId?: number;
  from?: string;
  to?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MerchandiserService {
  constructor(
    @InjectRepository(MerchandiserReport)
    private readonly mrRepo: Repository<MerchandiserReport>,
    @InjectRepository(MerchandiserReportItem)
    private readonly itemRepo: Repository<MerchandiserReportItem>,
    private readonly auditService: AuditService,
  ) {}

  private applyBrandFilter(
    current: JwtUser,
    qb: SelectQueryBuilder<MerchandiserReport>,
    brandParam?: number,
  ) {
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      qb.andWhere('pr.brand_id = :bid', { bid: current.brandId });
    } else if (brandParam != null) {
      qb.andWhere('pr.brand_id = :bid', { bid: brandParam });
    }
  }

  async list(current: JwtUser, q: MerchListQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));

    const qb = this.mrRepo
      .createQueryBuilder('mr')
      .innerJoinAndSelect('mr.parsedReport', 'pr')
      .leftJoinAndSelect('pr.brand', 'brand')
      .leftJoinAndSelect('pr.outlet', 'outlet')
      .orderBy('mr.id', 'DESC');

    this.applyBrandFilter(current, qb, q.brandId);

    if (q.outletId != null) {
      qb.andWhere('pr.outlet_id = :oid', { oid: q.outletId });
    }
    if (q.status) {
      qb.andWhere('pr.status = :st', { st: q.status });
    }
    if (q.from) {
      qb.andWhere('pr.created_at >= :from', { from: new Date(q.from) });
    }
    if (q.to) {
      qb.andWhere('pr.created_at <= :to', { to: new Date(q.to) });
    }

    const total = await qb.clone().getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOne(id: number, current: JwtUser): Promise<MerchandiserReport> {
    const mr = await this.mrRepo.findOne({
      where: { id },
      relations: [
        'parsedReport',
        'parsedReport.brand',
        'parsedReport.outlet',
        'items',
        'items.product',
      ],
    });
    if (!mr) {
      throw new NotFoundException('Merchandiser report not found');
    }
    if (current.role === 'brand_manager') {
      if (current.brandId !== mr.parsedReport.brandId) {
        throw new ForbiddenException('Out of brand scope');
      }
    }
    return mr;
  }

  async updateReport(
    id: number,
    dto: UpdateMerchandiserReportDto,
    current: JwtUser,
  ): Promise<MerchandiserReport> {
    const mr = await this.findOne(id, current);
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer'
    ) {
      throw new ForbiddenException();
    }

    if (dto.promoType !== undefined) {
      const old = mr.promoType;
      mr.promoType = dto.promoType;
      await this.auditService.log(
        current.id,
        'merchandiser_report',
        mr.id,
        'update',
        'promoType',
        old != null ? String(old) : null,
        dto.promoType != null ? String(dto.promoType) : null,
      );
    }
    if (dto.notes !== undefined) {
      const old = mr.notes;
      mr.notes = dto.notes;
      await this.auditService.log(
        current.id,
        'merchandiser_report',
        mr.id,
        'update',
        'notes',
        old != null ? String(old) : null,
        dto.notes != null ? String(dto.notes) : null,
      );
    }

    return this.mrRepo.save(mr);
  }

  async updateItem(
    reportId: number,
    itemId: number,
    dto: UpdateMerchandiserItemDto,
    current: JwtUser,
  ): Promise<MerchandiserReportItem> {
    const mr = await this.findOne(reportId, current);
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer'
    ) {
      throw new ForbiddenException();
    }

    const item = await this.itemRepo.findOne({
      where: { id: itemId, merchandiserReportId: mr.id },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (dto.productId !== undefined) {
      const old = item.productId;
      item.productId = dto.productId;
      item.isProductMatched = dto.productId != null;
      await this.auditService.log(
        current.id,
        'merchandiser_report_item',
        item.id,
        'update',
        'productId',
        old != null ? String(old) : null,
        dto.productId != null ? String(dto.productId) : null,
      );
    }
    if (dto.quantity !== undefined) {
      const old = item.quantity;
      item.quantity = dto.quantity;
      await this.auditService.log(
        current.id,
        'merchandiser_report_item',
        item.id,
        'update',
        'quantity',
        old != null ? String(old) : null,
        dto.quantity != null ? String(dto.quantity) : null,
      );
    }
    if (dto.expiryDate !== undefined) {
      const old = item.expiryDate;
      item.expiryDate = dto.expiryDate;
      await this.auditService.log(
        current.id,
        'merchandiser_report_item',
        item.id,
        'update',
        'expiryDate',
        old != null ? String(old) : null,
        dto.expiryDate != null ? String(dto.expiryDate) : null,
      );
    }

    return this.itemRepo.save(item);
  }
}
