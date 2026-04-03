import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from '../../users/entities/user.entity';

@Entity('product_aliases')
export class ProductAlias {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'product_id' })
  productId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  alias: string;

  @Column({ name: 'created_by', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
