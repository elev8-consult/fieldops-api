import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from '../../brands/entities/brand.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'brand_id' })
  brandId: number;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Column({ name: 'canonical_name' })
  canonicalName: string;

  @Column({ nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 32 })
  flow: string;

  @Column({ nullable: true })
  unit: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
