import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Region } from './region.entity';

@Entity('outlets')
export class Outlet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ name: 'is_depot', default: false })
  isDepot: boolean;

  @Column({ name: 'region_id' })
  regionId: number;

  @ManyToOne(() => Region)
  @JoinColumn({ name: 'region_id' })
  region: Region;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
