import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OutletType } from '../../common/enums/schema.enums';
import { Region } from './region.entity';

@Entity('outlets')
export class Outlet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: OutletType,
    enumName: 'outlet_type',
    default: OutletType.SUPERMARKET,
    // Audit fix: bind to SQL enum outlet_type for enum parity.
  })
  type: string;

  @Column({ name: 'is_depot', type: 'boolean', default: false })
  isDepot: boolean;

  @Column({ name: 'region_id', type: 'uuid', nullable: true })
  regionId: string | null;

  @ManyToOne(() => Region, (region) => region.outlets, { nullable: true })
  @JoinColumn({ name: 'region_id' })
  // Audit fix: outlet.region is nullable and points to regions.id.
  region: Region | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'double precision', nullable: true })
  // Audit fix: mapped outlets.latitude from schema inventory.
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  // Audit fix: mapped outlets.longitude from schema inventory.
  longitude: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
