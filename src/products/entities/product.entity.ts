import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductFlow } from '../../common/enums/schema.enums';
import { Brand } from '../../brands/entities/brand.entity';
import { ProductAlias } from './product-alias.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'uuid' })
  brandId: string;

  @ManyToOne(() => Brand, (brand) => brand.products)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'canonical_name', type: 'varchar', length: 200 })
  canonicalName: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sku: string | null;

  @Column({
    type: 'enum',
    enum: ProductFlow,
    enumName: 'product_flow',
    default: ProductFlow.BOTH,
    // Audit fix: bind to SQL enum product_flow for parity.
  })
  flow: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  unit: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ProductAlias, (alias) => alias.product)
  aliases: ProductAlias[];
}
