import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Outlet } from './outlet.entity';

@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 60, default: 'Lebanon' })
  // Audit fix: regions.country defaults to Lebanon per schema requirement.
  country: string;

  @OneToMany(() => Outlet, (outlet) => outlet.region)
  // Audit fix: enforce Region 1:N Outlet inverse relation.
  outlets: Outlet[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
