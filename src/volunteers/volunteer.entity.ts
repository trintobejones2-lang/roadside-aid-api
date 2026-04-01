import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('volunteers')
export class Volunteer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'boolean', default: false })
  isAvailable: boolean;

  @Column({ name: 'fuel_regular', type: 'boolean', default: false })
  fuelRegular: boolean;

  @Column({ name: 'fuel_diesel', type: 'boolean', default: false })
  fuelDiesel: boolean;

  @Column({ type: 'numeric', nullable: true })
  lastLat: string | null;

  @Column({ type: 'numeric', nullable: true })
  lastLng: string | null;

  @Column({ type: 'int', default: 10 })
  serviceRadiusKm: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
