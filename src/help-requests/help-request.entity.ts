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
  id: string;

  @Column({ type: 'uuid' })
  requesterId: string;

  @Column({ type: 'enum', enum: HelpType })
  type: HelpType;

  @Index()
  @Column({ type: 'enum', enum: HelpRequestStatus, default: HelpRequestStatus.OPEN })
  status: HelpRequestStatus;

  @Column({ type: 'numeric' })
  pickupLat: string;

  @Column({ type: 'numeric' })
  pickupLng: string;

  @Column({ type: 'text', nullable: true })
  pickupAddress: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
