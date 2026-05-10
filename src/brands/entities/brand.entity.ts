import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ name: 'whatsapp_group_id', type: 'varchar', length: 255, nullable: true })
  // Audit fix: mapped SQL brands.whatsapp_group_id to prevent runtime column mismatch.
  whatsappGroupId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.brand)
  // Audit fix: enforce Brand 1:N User bidirectional parity.
  users: User[];

  @OneToMany(() => Product, (product) => product.brand)
  // Audit fix: enforce Brand 1:N Product bidirectional parity.
  products: Product[];
}
