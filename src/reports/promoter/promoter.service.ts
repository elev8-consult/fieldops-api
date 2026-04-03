import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PromoterReport } from './entities/promoter-report.entity';
import { PromoterSaleItem } from './entities/promoter-sale-item.entity';
import { PromoterSampleItem } from './entities/promoter-sample-item.entity';
import { UpdatePromoterReportDto } from './dto/update-promoter-report.dto';
import { UpdatePromoterSaleItemDto } from './dto/update-promoter-sale-item.dto';
import { UpdatePromoterSampleItemDto } from './dto/update-promoter-sample-item.dto';

export interface PromoterListQuery {
  brandId?: number;
  outletId?: number;
  from?: string;
  to?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PromoterService {
  constructor(
    @InjectRepository(PromoterReport)
    private readonly prRepo: Repository<PromoterReport>,
    @InjectRepository(PromoterSaleItem)
    private readonly saleRepo: Repository<PromoterSaleItem>,
    @InjectRepository(PromoterSampleItem)
    private readonly sampleRepo: Repository<PromoterSampleItem>,
    private readonly auditService: AuditService,
  ) {}

  private applyBrandFilter(
    current: JwtUser,
    qb: SelectQueryBuilder<PromoterReport>,
    brandParam?: number,
  ) {
    if (current.role === 'brand_manager') {
      if (current.brandId == null) {
        throw new ForbiddenException('Brand manager has no brand');
      }
      qb.andWhere('parsed.brand_id = :bid', { bid: current.brandId });
    } else if (brandParam != null) {
      qb.andWhere('parsed.brand_id = :bid', { bid: brandParam });
    }
  }

  async list(current: JwtUser, q: PromoterListQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));

    const qb = this.prRepo
      .createQueryBuilder('pr')
      .innerJoinAndSelect('pr.parsedReport', 'parsed')
      .leftJoinAndSelect('parsed.brand', 'brand')
      .leftJoinAndSelect('parsed.outlet', 'outlet')
      .orderBy('pr.id', 'DESC');

    this.applyBrandFilter(current, qb, q.brandId);

    if (q.outletId != null) {
      qb.andWhere('parsed.outlet_id = :oid', { oid: q.outletId });
    }
    if (q.status) {
      qb.andWhere('parsed.status = :st', { st: q.status });
    }
    if (q.from) {
      qb.andWhere('parsed.created_at >= :from', { from: new Date(q.from) });
    }
    if (q.to) {
      qb.andWhere('parsed.created_at <= :to', { to: new Date(q.to) });
    }

    const total = await qb.clone().getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOne(id: number, current: JwtUser): Promise<PromoterReport> {
    const report = await this.prRepo.findOne({
      where: { id },
      relations: [
        'parsedReport',
        'parsedReport.brand',
        'parsedReport.outlet',
        'saleItems',
        'saleItems.product',
        'sampleItems',
        'sampleItems.product',
      ],
    });
    if (!report) {
      throw new NotFoundException('Promoter report not found');
    }
    if (current.role === 'brand_manager') {
      if (current.brandId !== report.parsedReport.brandId) {
        throw new ForbiddenException('Out of brand scope');
      }
    }
    return report;
  }

  private assertCanEdit(current: JwtUser) {
    if (
      current.role !== 'super_admin' &&
      current.role !== 'brand_manager' &&
      current.role !== 'reviewer'
    ) {
      throw new ForbiddenException();
    }
  }

  async updateReport(
    id: number,
    dto: UpdatePromoterReportDto,
    current: JwtUser,
  ): Promise<PromoterReport> {
    const report = await this.findOne(id, current);
    this.assertCanEdit(current);

    if (dto.promoStandPlacement !== undefined) {
      const old = report.promoStandPlacement;
      report.promoStandPlacement = dto.promoStandPlacement;
      await this.auditService.log(
        current.id,
        'promoter_report',
        report.id,
        'update',
        'promoStandPlacement',
        old != null ? String(old) : null,
        dto.promoStandPlacement != null ? String(dto.promoStandPlacement) : null,
      );
    }
    if (dto.personsContacted !== undefined) {
      const old = report.personsContacted;
      report.personsContacted = dto.personsContacted;
      await this.auditService.log(
        current.id,
        'promoter_report',
        report.id,
        'update',
        'personsContacted',
        old != null ? String(old) : null,
        dto.personsContacted != null ? String(dto.personsContacted) : null,
      );
    }
    if (dto.personsTasted !== undefined) {
      const old = report.personsTasted;
      report.personsTasted = dto.personsTasted;
      await this.auditService.log(
        current.id,
        'promoter_report',
        report.id,
        'update',
        'personsTasted',
        old != null ? String(old) : null,
        dto.personsTasted != null ? String(dto.personsTasted) : null,
      );
    }
    if (dto.feedbackText !== undefined) {
      const old = report.feedbackText;
      report.feedbackText = dto.feedbackText;
      await this.auditService.log(
        current.id,
        'promoter_report',
        report.id,
        'update',
        'feedbackText',
        old != null ? String(old) : null,
        dto.feedbackText != null ? String(dto.feedbackText) : null,
      );
    }

    return this.prRepo.save(report);
  }

  async updateSaleItem(
    reportId: number,
    itemId: number,
    dto: UpdatePromoterSaleItemDto,
    current: JwtUser,
  ): Promise<PromoterSaleItem> {
    const report = await this.findOne(reportId, current);
    this.assertCanEdit(current);

    const item = await this.saleRepo.findOne({
      where: { id: itemId, promoterReportId: report.id },
    });
    if (!item) {
      throw new NotFoundException('Sale item not found');
    }

    if (dto.productId !== undefined) {
      const old = item.productId;
      item.productId = dto.productId;
      item.isProductMatched = dto.productId != null;
      await this.auditService.log(
        current.id,
        'promoter_sale_item',
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
        'promoter_sale_item',
        item.id,
        'update',
        'quantity',
        old != null ? String(old) : null,
        dto.quantity != null ? String(dto.quantity) : null,
      );
    }
    if (dto.promoLabel !== undefined) {
      const old = item.promoLabel;
      item.promoLabel = dto.promoLabel;
      await this.auditService.log(
        current.id,
        'promoter_sale_item',
        item.id,
        'update',
        'promoLabel',
        old != null ? String(old) : null,
        dto.promoLabel != null ? String(dto.promoLabel) : null,
      );
    }
    if (dto.isOffer !== undefined) {
      const old = item.isOffer;
      item.isOffer = dto.isOffer;
      await this.auditService.log(
        current.id,
        'promoter_sale_item',
        item.id,
        'update',
        'isOffer',
        String(old),
        String(dto.isOffer),
      );
    }

    return this.saleRepo.save(item);
  }

  async updateSampleItem(
    reportId: number,
    itemId: number,
    dto: UpdatePromoterSampleItemDto,
    current: JwtUser,
  ): Promise<PromoterSampleItem> {
    const report = await this.findOne(reportId, current);
    this.assertCanEdit(current);

    const item = await this.sampleRepo.findOne({
      where: { id: itemId, promoterReportId: report.id },
    });
    if (!item) {
      throw new NotFoundException('Sample item not found');
    }

    if (dto.productId !== undefined) {
      const old = item.productId;
      item.productId = dto.productId;
      item.isProductMatched = dto.productId != null;
      await this.auditService.log(
        current.id,
        'promoter_sample_item',
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
        'promoter_sample_item',
        item.id,
        'update',
        'quantity',
        old != null ? String(old) : null,
        dto.quantity != null ? String(dto.quantity) : null,
      );
    }
    if (dto.availabilityNote !== undefined) {
      const old = item.availabilityNote;
      item.availabilityNote = dto.availabilityNote;
      await this.auditService.log(
        current.id,
        'promoter_sample_item',
        item.id,
        'update',
        'availabilityNote',
        old != null ? String(old) : null,
        dto.availabilityNote != null ? String(dto.availabilityNote) : null,
      );
    }

    return this.sampleRepo.save(item);
  }
}
