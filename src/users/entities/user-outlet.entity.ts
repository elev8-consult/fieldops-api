import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Outlet } from '../../outlets/entities/outlet.entity';
import { User } from './user.entity';

/** Which outlets a mobile (merchandiser/promoter) user is allowed to report on. */
@Entity('user_outlets')
export class UserOutlet {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'outlet_id', type: 'uuid' })
  outletId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Outlet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'outlet_id' })
  outlet: Outlet;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
