import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum HelpType {
  GAS = 'GAS',
  TIRE = 'TIRE',
  JUMP = 'JUMP',
  TOW = 'TOW',
  LOCKOUT = 'LOCKOUT',
  OTHER = 'OTHER',
}

export enum FuelType {
  REGULAR = 'REGULAR',
  DIESEL = 'DIESEL',
}

export enum HelpRequestStatus {
  OPEN = 'OPEN',
  CLAIMED = 'CLAIMED',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  DISPUTED = 'DISPUTED',
}

@Entity('help_requests')
export class HelpRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column({ name: 'requester_rating', type: 'int', nullable: true })
  requesterRating!: number | null;

  @Column({ name: 'requester_review', type: 'text', nullable: true })
  requesterReview!: string | null;
  @Column({ type: 'uuid' })
  requesterId!: string;

  @Column({ type: 'enum', enum: HelpType })
  type!: HelpType;

  @Column({
    name: 'fuel_type',
    type: 'enum',
    enum: FuelType,
    enumName: 'fuel_type_enum',
    nullable: true,
  })
  fuelType!: FuelType | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_accept_lat?: number | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_accept_lng?: number | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_arrived_lat?: number | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_arrived_lng?: number | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_completed_lat?: number | null;

  @Column({ type: 'double precision', nullable: true })
  volunteer_completed_lng?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  volunteer_accept_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  volunteer_arrived_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  volunteer_completed_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  anti_cheat_flag!: boolean;

  @Column({ type: 'text', nullable: true })
  anti_cheat_reason?: string | null;

  @Index()
  @Column({ type: 'enum', enum: HelpRequestStatus, default: HelpRequestStatus.OPEN })
  status!: HelpRequestStatus;

  @Column({ type: 'numeric' })
  pickupLat!: string;

  @Column({ type: 'numeric' })
  pickupLng!: string;

  @Column({ type: 'text', nullable: true })
  pickupAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
  @Column({ type: 'int', nullable: true })
  rating!: number | null;

  @Column({ type: 'text', nullable: true })
  review!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
